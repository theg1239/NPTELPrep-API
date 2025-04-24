"use client";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { TuiButton, TuiInput, TuiPanel, TuiAlert } from "@/components/tui/components";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

export default function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams?.get("error");
  const registered = searchParams?.get("registered");

  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState("");

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    
    if (!formData.email || !formData.password) {
      setFormError("Email and password are required");
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await signIn("credentials", {
        email: formData.email,
        password: formData.password,
        redirect: true,
        callbackUrl: "/dashboard",
      });
      
    } catch (err: any) {
      setFormError(err.message || "An error occurred during sign in");
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    await signIn("google", { callbackUrl: "/dashboard" });
  };

  return (
    <div className="text-tui-white">
      <div className="border-b border-tui-blue text-sm mb-4 pb-1 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-tui-blue mr-2">NORMAL</span>
          <span className="text-tui-white">login.js</span>
          <span className="text-tui-gray ml-2">[+]</span>
        </div>
        <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
      </div>

      {registered && (
        <TuiAlert
          type="success"
          message="Account created successfully! You can now log in."
          className="mb-4"
        />
      )}

      <TuiPanel title="Sign In" color="cyan">
        <div className="px-3 py-2">
          <form onSubmit={handleSubmit} className="space-y-3">
            {(error || formError) && (
              <TuiAlert
                type="error"
                message={formError || (error === "CredentialsSignin" ? "Invalid email or password" : "Authentication error")}
                className="mb-4"
              />
            )}
            
            <div className="space-y-3">
              <TuiInput
                label="Email"
                type="email"
                value={formData.email}
                onChange={(value) => handleChange("email", value)}
                placeholder="your.email@example.com"
                required
              />
              
              <TuiInput
                label="Password"
                type="password"
                value={formData.password}
                onChange={(value) => handleChange("password", value)}
                placeholder="••••••••"
                required
              />
            </div>
            
            <div className="pt-2">
              <TuiButton
                type="submit"
                variant="primary"
                className="w-full"
                disabled={loading}
              >
                {loading ? "Signing In..." : "Sign In"}
              </TuiButton>
            </div>
          </form>
          
          <div className="mt-4 border-t border-tui-gray pt-3 text-center">
            <div className="text-tui-gray text-xs mb-2">Or sign in with</div>
            
            <TuiButton
              onClick={handleGoogleSignIn}
              variant="secondary"
              className="w-full"
              disabled={loading}
            >
              Google Account
            </TuiButton>
          </div>
          
          <div className="mt-4 text-center">
            <div className="text-tui-gray text-xs">
              Don't have an account? <Link href="/auth/register" className="text-tui-cyan">Sign up</Link>
            </div>
          </div>
        </div>
      </TuiPanel>
      
      <div className="mt-3 border-t border-tui-gray pt-2">
        <pre className="text-tui-gray text-xs">
          Press <span className="text-tui-cyan">Tab</span> to navigate, <span className="text-tui-cyan">Enter</span> to submit
        </pre>
      </div>
    </div>
  );
}
