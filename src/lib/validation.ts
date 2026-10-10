/*
 * Shared Zod schemas for people & project create/update (API + forms).
 * Store functions trust these shapes; routes and forms both validate here.
 */
import { z } from "zod";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "التاريخ غير صالح (YYYY-MM-DD)");

// Open-ended field: a valid date, "" (empty <input type="date">), null
// (cleared) or absent all mean "no end date". No transform on purpose —
// RHF input and API output stay the same type.
const optionalDateStr = z.union([dateStr, z.literal(""), z.null()]).optional();

const personBase = z.object({
  name: z.string().trim().min(2, "أدخل الاسم (حرفان على الأقل)").max(100),
  type: z.enum(["CRAFTSMAN", "WORKER"]),
  phone: z.string().trim().max(20, "رقم الهاتف طويل جداً").optional(),
  currentDailyRate: z
    .number({ invalid_type_error: "الأجر اليومي يجب أن يكون رقماً" })
    .finite("الأجر اليومي غير صالح")
    .min(0, "الأجر اليومي لا يكون سالباً")
    .max(1000000, "الأجر اليومي كبير جداً"),
  active: z.boolean().optional(),
});

export const personCreateSchema = personBase;
export const personPatchSchema = personBase.partial();

export type PersonCreateInput = z.infer<typeof personCreateSchema>;
export type PersonPatchInput = z.infer<typeof personPatchSchema>;

export const userPatchSchema = z.object({
  name: z.string().trim().min(2, "أدخل الاسم").max(100).optional(),
  role: z.enum(["ADMIN"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8, "كلمة المرور ٨ أحرف على الأقل").optional(),
});

export type UserPatchInput = z.infer<typeof userPatchSchema>;

const dayOfWeek = z.enum([
  "SATURDAY",
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
]);

function datesMakeSense(v: { startDate?: string; endDate?: string | null }): boolean {
  if (!v.startDate || !v.endDate) return true;
  return v.endDate >= v.startDate;
}

const projectBase = z.object({
  name: z.string().trim().min(2, "أدخل اسم المشروع").max(150),
  startDate: dateStr,
  endDate: optionalDateStr,
  status: z.enum(["ACTIVE", "COMPLETED", "ON_HOLD", "CANCELLED"]),
  workingDays: z.array(dayOfWeek).min(1, "اختر يوماً واحداً على الأقل"),
});

export const projectCreateSchema = projectBase.refine(datesMakeSense, {
  message: "تاريخ النهاية قبل تاريخ البداية",
  path: ["endDate"],
});
export const projectPatchSchema = projectBase.partial().refine(datesMakeSense, {
  message: "تاريخ النهاية قبل تاريخ البداية",
  path: ["endDate"],
});

export type ProjectCreateInput = z.infer<typeof projectCreateSchema>;
export type ProjectPatchInput = z.infer<typeof projectPatchSchema>;

/** Only ADMIN can manage people, projects, and attendance. */
export function canManage(role: string | undefined): boolean {
  return role === "ADMIN";
}
