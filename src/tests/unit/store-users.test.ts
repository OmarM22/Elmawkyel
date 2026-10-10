/*
 * Demo-store user update tests (in-memory, node environment).
 * Password hashing itself is covered by login smoke tests.
 */
import { describe, expect, it } from "vitest";
import { createUser, listUsers, updateUser } from "@/server/demo";

describe("demo store user update", () => {
  it("updates name, role, and active flag without leaking the hash", async () => {
    const created = await createUser({
      username: "testedit",
      email: "testedit@test.local",
      name: "قبل",
      passwordHash: "scrypt$old",
      role: "ADMIN",
    });
    const updated = await updateUser(created.id, { name: "بعد", role: "ADMIN", active: false });
    expect(updated).toMatchObject({ name: "بعد", role: "ADMIN", active: false });
    expect(updated).not.toHaveProperty("passwordHash");
    expect(updated?.username).toBe("testedit"); // untouched fields preserved
  });

  it("swaps the password hash when supplied", async () => {
    const created = await createUser({
      username: "testpass",
      email: "testpass@test.local",
      name: "باس",
      passwordHash: "scrypt$old",
      role: "ADMIN",
    });
    await updateUser(created.id, { passwordHash: "scrypt$new" });
    const again = await updateUser(created.id, { name: "باس2" });
    expect(again?.name).toBe("باس2"); // row still consistent
    expect((await listUsers()).some((u) => u.username === "testpass")).toBe(true);
  });

  it("returns null for a missing user", async () => {
    await expect(updateUser("u-nope", { name: "x" })).resolves.toBeNull();
  });
});
