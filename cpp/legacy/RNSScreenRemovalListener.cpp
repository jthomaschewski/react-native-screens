#include "RNSScreenRemovalListener.h"
#include <react/renderer/mounting/ShadowViewMutation.h>
#include <algorithm>
#include <cstring>
#include <utility>
using namespace facebook::react;

namespace {
bool isScreenRemoval(const ShadowViewMutation &mutation) {
  // When using RNSModalScreen on Android it should be added here.
  return mutation.type == ShadowViewMutation::Type::Remove &&
      mutation.oldChildShadowView.componentName != nullptr &&
      std::strcmp(mutation.oldChildShadowView.componentName, "RNSScreen") == 0;
}
} // namespace

uint64_t RNSScreenRemovalListener::setListener(
    std::function<void(int)> &&listenerFunction) {
  std::lock_guard<std::mutex> lock(listenerMutex_);
  listenerFunction_ = std::move(listenerFunction);
  return ++currentToken_;
}

void RNSScreenRemovalListener::clearListener(uint64_t token) {
  std::lock_guard<std::mutex> lock(listenerMutex_);
  if (token == currentToken_) {
    listenerFunction_ = nullptr;
  }
}

std::optional<MountingTransaction> RNSScreenRemovalListener::pullTransaction(
    SurfaceId surfaceId,
    MountingTransaction::Number transactionNumber,
    const TransactionTelemetry &telemetry,
    ShadowViewMutationList mutations) const {
  // Copy under the lock, invoke outside it: the callback makes a JNI call and
  // must not run while holding a lock the module thread also takes.
  std::function<void(int)> listener;
  {
    std::lock_guard<std::mutex> lock(listenerMutex_);
    listener = listenerFunction_;
  }

  if (!listener) {
    // Orphaned between module teardown and the next install: pass the
    // transaction through untouched.
    return MountingTransaction{
        surfaceId, transactionNumber, std::move(mutations), telemetry};
  }

  for (const ShadowViewMutation &mutation : mutations) {
    if (isScreenRemoval(mutation)) {
      // We call the listener function even if this screen has not been owned
      // by RNSScreenStack as since RN 0.78 we do not have enough information
      // here. This final filter is applied later in NativeProxy.
      listener(mutation.oldChildShadowView.tag);
    }
  }

  // Fabric removes a deleted subtree bottom-up and the screen itself last.
  // Screen removals go first, so that ScreenStackViewManager.removeViewAt
  // starts the removal transition while the screen's subtree is still intact.
  // Their relative order is kept, so indices within a stack stay valid.
  std::stable_partition(mutations.begin(), mutations.end(), isScreenRemoval);

  return MountingTransaction{
      surfaceId, transactionNumber, std::move(mutations), telemetry};
}

bool RNSScreenRemovalListener::shouldOverridePullTransaction() const {
  return true;
}
