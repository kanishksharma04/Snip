export type ActionResult<T> =
  | { success: true; data: T }
  // `field` is optional: most failures are generic (network/db errors go to
  // a toast), but some map to a specific form input — e.g. a taken custom
  // slug should surface under that field, not as a page-level message.
  | { success: false; error: string; field?: string };
