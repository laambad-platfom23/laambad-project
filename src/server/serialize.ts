/** Convert Prisma values (BigInt, Decimal, Date) into JSON-safe shapes matching Go API. */
export function ser<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") return Number(v);
      if (v !== null && typeof v === "object" && typeof v.toNumber === "function") {
        return v.toNumber();
      }
      return v;
    })
  );
}

export function snakeUser(u: {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  phone?: string | null;
  address?: string | null;
  gender?: string | null;
  avatarUrl?: string | null;
  isActive?: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    username: u.username || undefined,
    phone: u.phone || undefined,
    address: u.address || undefined,
    gender: u.gender || undefined,
    avatar_url: u.avatarUrl || undefined,
    is_active: u.isActive,
    created_at: u.createdAt?.toISOString(),
    updated_at: u.updatedAt?.toISOString(),
  };
}

export function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "course";
}
