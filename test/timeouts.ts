export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const ORACLE_TEST_TIMEOUT = parsePositiveInteger(
  process.env.PVS_ORACLE_TEST_TIMEOUT_MS,
  5 * MINUTE,
);

export const ORACLE_PROPERTY_NUM_RUNS = parsePositiveInteger(
  process.env.PVS_PROPERTY_RUNS,
  1,
);
