const MAX_RECENT_VALUES = 8;

export type RecentInputField = "practiceId" | "patientId" | "departmentId";

const getStorageKey = (field: RecentInputField) =>
  `prescription-link:recent-inputs:${field}`;

export function getRecentInputValues(field: RecentInputField): string[] {
  if (typeof window === "undefined") return [];

  try {
    const storedValues = window.localStorage.getItem(getStorageKey(field));
    if (!storedValues) return [];

    const parsedValues: unknown = JSON.parse(storedValues);
    if (!Array.isArray(parsedValues)) return [];

    return parsedValues.filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    );
  } catch {
    return [];
  }
}

export function rememberRecentInputValue(
  field: RecentInputField,
  value: string,
): string[] {
  const trimmedValue = value.trim();
  if (!trimmedValue || typeof window === "undefined") {
    return getRecentInputValues(field);
  }

  const values = [
    trimmedValue,
    ...getRecentInputValues(field).filter((item) => item !== trimmedValue),
  ].slice(0, MAX_RECENT_VALUES);

  try {
    window.localStorage.setItem(getStorageKey(field), JSON.stringify(values));
  } catch {
  }

  return values;
}