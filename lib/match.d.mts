export function normEcosystem(e: string): string;
export function normName(ecosystem: string, name: string): string;
export function compareVersions(a: string, b: string): number | null;
export function inRange(version: string, range: string | null | undefined): boolean | "maybe";
export function matchPackages(packages: unknown[], advisories: unknown[]): unknown[];
