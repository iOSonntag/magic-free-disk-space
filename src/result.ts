export type ResultSucceeded<TValue> = { kind: 'succeeded'; value: TValue };

export type ResultFailed<TFailure> = { kind: 'failed'; failure: TFailure };

export type Result<TValue, TFailure> = ResultSucceeded<TValue> | ResultFailed<TFailure>;
