import type { Result } from '../result.js';
import { isJsonObject, parseJsonValue } from '../system/parseJsonValue.js';

type BridgeRequestScan = { kind: 'scan' };

type BridgeRequestPlan = { kind: 'plan'; numbers: number[] };

type BridgeRequestDelete = { kind: 'delete'; planId: number; confirmation: string };

type BridgeRequest = BridgeRequestScan | BridgeRequestPlan | BridgeRequestDelete;

type BridgeRequestFailure = { reason: 'invalidJson' | 'unknownRequest' };

/** Parses one line the app sent; any shape but the three requests fails. */
export function parseBridgeRequest(params: {
  line: string;
}): Result<BridgeRequest, BridgeRequestFailure> {
  const parsedJson = parseJsonValue({ text: params.line });

  if (parsedJson.kind === 'failed') {
    return { kind: 'failed', failure: { reason: 'invalidJson' } };
  }

  const request = toBridgeRequest({ value: parsedJson.value });

  if (request === null) {
    return { kind: 'failed', failure: { reason: 'unknownRequest' } };
  }

  return { kind: 'succeeded', value: request };
}

/** `null` when the value is none of the requests. */
function toBridgeRequest(params: { value: unknown }): BridgeRequest | null {
  if (!isJsonObject(params.value)) {
    return null;
  }

  if (params.value.kind === 'scan') {
    return { kind: 'scan' };
  }

  if (params.value.kind === 'plan' && isIntegerArray(params.value.numbers)) {
    return { kind: 'plan', numbers: params.value.numbers };
  }

  if (
    params.value.kind === 'delete' &&
    typeof params.value.planId === 'number' &&
    Number.isSafeInteger(params.value.planId) &&
    typeof params.value.confirmation === 'string'
  ) {
    return {
      kind: 'delete',
      planId: params.value.planId,
      confirmation: params.value.confirmation,
    };
  }

  return null;
}

function isIntegerArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.every((element) => Number.isSafeInteger(element));
}
