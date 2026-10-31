/**
 * Maps Recovery Response API field names to the form's client field keys.
 *
 * The draft uses `campusArea` and `whereFoundExactPlace`; the form uses
 * `whereFoundArea` and `exactPlace`.
 */
export function recoveryResponseClientField(serverField: string): string {
  if (serverField === 'campusArea') {
    return 'whereFoundArea';
  }

  if (serverField === 'whereFoundExactPlace') {
    return 'exactPlace';
  }

  return serverField;
}
