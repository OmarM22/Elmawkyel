"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2, HardHat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  login: z.string().trim().min(1, "أدخل اسم المستخدم أو البريد الإلكتروني"),
  password: z.string().min(1, "أدخل كلمة المرور"),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(values: LoginValues) {
    setServerError(null);
    const res = await signIn("credentials", {
      redirect: false,
      login: values.login,
      password: values.password,
      callbackUrl,
    });
    if (!res || res.error) {
      setServerError("بيانات الدخول غير صحيحة. تحقق من اسم المستخدم وكلمة المرور.");
      return;
    }
    router.push(res.url || callbackUrl);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="items-center text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
            <HardHat className="size-7" />
          </div>
          <CardTitle className="text-2xl">الوكيل</CardTitle>
          <CardDescription>نظام إدارة حضور العمال — تسجيل الدخول</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login" className="text-sm font-medium">
                اسم المستخدم أو البريد الإلكتروني
              </label>
              <Input
                id="login"
                autoComplete="username"
                placeholder="مثال: admin"
                aria-invalid={!!errors.login}
                {...register("login")}
              />
              {errors.login && <p className="text-sm text-destructive">{errors.login.message}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium">
                كلمة المرور
              </label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-invalid={!!errors.password}
                  className="pl-10"
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
            </div>
            {serverError && (
              <p role="alert" className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {serverError}
              </p>
            )}
            <Button type="submit" disabled={isSubmitting} className={cn("w-full")}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isSubmitting ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              نظام داخلي — لا يوجد تسجيل حسابات جديدة. تواصل مع مدير النظام للحصول على حساب.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
