import type { Role } from "@/types";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface User {
    id: string;
    username: string;
    role: Role;
  }
  interface Session {
    user: {
      id: string;
      username: string;
      role: Role;
      name?: string | null;
      email?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    username?: string;
    role?: Role;
  }
}
