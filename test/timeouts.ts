export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;

export const ORACLE_TEST_TIMEOUT = 60 * MINUTE;

const parsePositiveInteger = (value: string | undefined, fallback: number) => {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const ORACLE_PROPERTY_NUM_RUNS = parsePositiveInteger(
  process.env.PVS_PROPERTY_RUNS,
  1,
);
