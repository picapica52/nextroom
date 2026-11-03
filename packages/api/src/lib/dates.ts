// Dates in the server's local time.

export const pad2 = (n: number) => String(n).padStart(2, "0");

/** "2026-11-04" */
export const localDate = (date: Date) =>
	`${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
