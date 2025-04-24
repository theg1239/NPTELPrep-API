"use client";
import { useState } from "react";
import { createApiKey } from "@/actions/api-key";
import { TuiButton, TuiInput, TuiAlert, TuiForm } from "@/components/tui/components";

export default function ClientNewKeyForm() {
  const [name, setName] = useState("");
  const [rateLimit, setRateLimit] = useState(100);
  const [expiresAt, setExpiresAt] = useState("");
  const [status, setStatus] = useState<{
    message: string;
    type: "success" | "error" | "none";
    key?: string;
  }>({
    message: "",
    type: "none"
  });
  const [copySuccess, setCopySuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.append("name", name);
    formData.append("rateLimit", rateLimit.toString());
    if (expiresAt.trim() !== "") {
      formData.append("expiresAt", expiresAt);
    }

    const result = await createApiKey(formData);

    if (result.error) {
      setStatus({
        message: result.error || "",
        type: "error"
      });
    } else {
      setStatus({
        message: result.success || "",
        type: "success",
        key: result.key
      });
      setName("");
      setRateLimit(100);
      setExpiresAt("");
      setCopySuccess(false);
    }
  }

  const handleCopyKey = () => {
    if (status.key) {
      navigator.clipboard.writeText(status.key)
        .then(() => {
          setCopySuccess(true);
          setTimeout(() => setCopySuccess(false), 2000);
        })
        .catch(err => {
          console.error('Failed to copy: ', err);
        });
    }
  };

  const handleCreateNewKey = () => {
    setStatus({
      message: "",
      type: "none"
    });
  };

  if (status.type === "success" && status.key) {
    return (
      <div className="space-y-4">
        <TuiAlert
          type="success"
          message={status.message}
        />
        <div className="mt-4 border border-tui-yellow p-4 bg-black">
          <p className="text-tui-cyan text-sm mb-2">Your new API key:</p>
          <div className="bg-tui-black/40 p-3 rounded border border-tui-blue overflow-x-auto">
            <code className="text-tui-green text-sm font-mono">{status.key}</code>
          </div>
          <div className="flex justify-between items-center mt-3">
            <p className="text-xs text-tui-red">
              Make sure to copy this key now. You won't be able to see it again!
            </p>
            <TuiButton
              onClick={handleCopyKey}
              variant="primary"
              size="sm"
              shortcut="c"
            >
              {copySuccess ? "Copied!" : "Copy Key"}
            </TuiButton>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <TuiButton
            onClick={handleCreateNewKey}
            variant="secondary"
            size="sm"
          >
            Create Another Key
          </TuiButton>
        </div>
      </div>
    );
  }

  return (
    <TuiForm onSubmit={handleSubmit} className="space-y-4">
      {status.type === "error" && (
        <TuiAlert
          type="error"
          message={status.message}
        />
      )}
      
      <div className="mb-4">
        <TuiInput
          label="API Key Name"
          value={name}
          onChange={setName}
          placeholder="My Project API Key"
          required
        />
        <p className="mt-1 text-xs text-tui-gray">
          A friendly name to identify this API key
        </p>
      </div>

      <div className="mb-4">
        <TuiInput
          label="Rate Limit (requests per day)"
          value={rateLimit.toString()}
          onChange={(val) => setRateLimit(parseInt(val) || 0)}
          type="number"
          required
        />
        <p className="mt-1 text-xs text-tui-gray">
          Maximum number of API requests allowed per day
        </p>
      </div>

      <div className="mb-4">
        <TuiInput
          label="Expiration Date (optional)"
          value={expiresAt}
          onChange={setExpiresAt}
          type="date"
        />
        <p className="mt-1 text-xs text-tui-gray">
          When this API key should expire (leave blank for no expiration)
        </p>
      </div>

      <div className="mt-6">
        <TuiButton type="submit" variant="success">
          Generate API Key
        </TuiButton>
      </div>
    </TuiForm>
  );
}
