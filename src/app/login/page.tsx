"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ThemeToggle } from "@/components/layout/theme-toggle";
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <ThemeToggle className="absolute left-4 top-4 z-20" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_500px_at_50%_-10%,rgba(184,121,88,0.10),transparent_60%)] dark:bg-[radial-gradient(900px_500px_at_50%_-10%,rgba(184,121,88,0.18),transparent_60%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_420px_at_85%_110%,rgba(184,121,88,0.05),transparent_55%)] dark:bg-[radial-gradient(700px_420px_at_85%_110%,rgba(184,121,88,0.08),transparent_55%)]"
      />
      <Card className="relative z-10 w-full max-w-md border-border/70 shadow-2xl shadow-black/20 dark:shadow-black/40">
        <CardHeader className="items-center gap-4 text-center">
          <div className="rounded-lg border border-border/70 bg-white p-2.5">
            <Image
              src="/tarek-al-wakil-logo.png"
              alt="شعار طارق الوكيل"
              width={1408}
              height={768}
              priority
              className="h-16 w-auto object-contain"
            />
          </div>
          <div className="flex flex-col gap-1">
            <CardTitle className="text-2xl font-bold tracking-wide">الوكيل</CardTitle>
            <CardDescription>نظام طارق الوكيل لإدارة حضور العمال — تسجيل الدخول</CardDescription>
          </div>
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
