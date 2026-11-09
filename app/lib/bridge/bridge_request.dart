/// The requests the bridge reads, each sent as one line of JSON.
library;

Map<String, Object> buildScanRequest() {
  return {'kind': 'scan'};
}

Map<String, Object> buildPlanRequest(List<int> numbers) {
  return {'kind': 'plan', 'numbers': numbers};
}

Map<String, Object> buildDeleteRequest({
  required int planId,
  required String confirmation,
}) {
  return {'kind': 'delete', 'planId': planId, 'confirmation': confirmation};
}

Map<String, Object> buildStatusRequest() {
  return {'kind': 'status'};
}

Map<String, Object> buildCheckUpdateRequest() {
  return {'kind': 'checkUpdate'};
}

Map<String, Object> buildSetUpdateCheckRequest(bool isEnabled) {
  return {'kind': 'setUpdateCheck', 'isEnabled': isEnabled};
}

/// Asks for the view of the scan the bridge holds, such as the one a deletion
/// kept.
Map<String, Object> buildShowScanRequest() {
  return {'kind': 'showScan'};
}

Map<String, Object> buildSetRescanAfterDeletionRequest(bool isEnabled) {
  return {'kind': 'setRescanAfterDeletion', 'isEnabled': isEnabled};
}
