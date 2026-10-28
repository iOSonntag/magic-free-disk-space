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
