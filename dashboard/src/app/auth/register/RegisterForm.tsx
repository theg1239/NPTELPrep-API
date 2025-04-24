"use client";
import { useState } from "react";
import { TuiButton, TuiInput, TuiPanel, TuiAlert } from "@/components/tui/components";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function RegisterForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    
    if (!formData.name || !formData.email || !formData.password) {
      setError("All fields are required");
      return;
    }
    
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || "Registration failed");
      }
      
      router.push("/auth/login?registered=true");
      
    } catch (err: any) {
      setError(err.message || "An error occurred during registration");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="text-tui-white">
      <div className="border-b border-tui-blue text-sm mb-4 pb-1 flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-tui-blue mr-2">NORMAL</span>
          <span className="text-tui-white">register.js</span>
          <span className="text-tui-gray ml-2">[+]</span>
        </div>
        <div className="text-tui-gray">{new Date().toLocaleDateString()}</div>
      </div>

      <TuiPanel title="Create Account" color="cyan">
        <div className="px-3 py-2">
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && (
              <TuiAlert
                type="error"
                message={error}
                className="mb-4"
              />
            )}
            
            <div className="space-y-3">
              <TuiInput
                label="Name"
                value={formData.name}
                onChange={(value) => handleChange("name", value)}
                placeholder="Your full name"
                required
              />
              
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
              
              <TuiInput
                label="Confirm Password"
                type="password"
                value={formData.confirmPassword}
                onChange={(value) => handleChange("confirmPassword", value)}
                  placeholder="••••••••"
                required
              />
            </div>
            
            <div className="pt-2">
              <TuiButton
                type="submit"
                variant="success"
                className="w-full"
                disabled={loading}
              >
                {loading ? "Creating Account..." : "Create Account"}
              </TuiButton>
            </div>
          </form>
          
          <div className="mt-4 border-t border-tui-gray pt-3 text-center">
            <div className="text-tui-gray text-xs mb-2">Or sign up with</div>
            
            <Link href={`/api/auth/signin/google?callbackUrl=/dashboard`} className="block">
              <TuiButton
                variant="secondary"
                className="w-full"
              >
                Google Account
              </TuiButton>
            </Link>
          </div>
          
          <div className="mt-4 text-center">
            <div className="text-tui-gray text-xs">
              Already have an account? <Link href="/auth/login" className="text-tui-cyan">Sign in</Link>
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