"use client";

import { useState } from "react";
import { TuiPanel, TuiInput, TuiSwitch, TuiButton } from "@/components/tui/components";

export function RateLimitSettings({ initialSettings }: { initialSettings: any }) {
  const [settings, setSettings] = useState(initialSettings);

  const handleChange = (key: string, value: any) => {
    setSettings((prev: any) => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <TuiPanel title="Rate Limiting" color="blue">
      <div className="px-4 py-3 space-y-3">
        <div>
          <label className="block text-tui-gray text-sm mb-1">Default Rate Limit</label>
          <TuiInput 
            type="number"
            value={settings.defaultLimit.toString()}
            onChange={(value) => handleChange("defaultLimit", parseInt(value))}
          />
        </div>
        <div>
          <label className="block text-tui-gray text-sm mb-1">Maximum Rate Limit</label>
          <TuiInput 
            type="number"
            value={settings.maxLimit.toString()}
            onChange={(value) => handleChange("maxLimit", parseInt(value))}
          />
        </div>
        <div className="flex items-center">
          <TuiSwitch 
            checked={settings.enabled} 
            onChange={(checked) => handleChange("enabled", checked)}
          />
          <span className="ml-2 text-tui-white">Enable Rate Limiting</span>
        </div>
        <div className="flex justify-end pt-2">
          <TuiButton variant="primary" size="sm" onClick={() => console.log('Save Rate Limit Settings', settings)}>
            Save Changes
          </TuiButton>
        </div>
      </div>
    </TuiPanel>
  );
}

export function SecuritySettings({ initialSettings }: { initialSettings: any }) {
  const [settings, setSettings] = useState(initialSettings);

  const handleChange = (key: string, value: any) => {
    setSettings((prev: any) => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <TuiPanel title="Security Settings" color="magenta">
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center">
          <TuiSwitch 
            checked={settings.requireEmail} 
            onChange={(checked) => handleChange("requireEmail", checked)}
          />
          <span className="ml-2 text-tui-white">Require Email Verification</span>
        </div>
        <div>
          <label className="block text-tui-gray text-sm mb-1">Max Failed Login Attempts</label>
          <TuiInput 
            type="number"
            value={settings.maxFailedLogins.toString()}
            onChange={(value) => handleChange("maxFailedLogins", parseInt(value))}
          />
        </div>
        <div>
          <label className="block text-tui-gray text-sm mb-1">Account Lockout Duration (minutes)</label>
          <TuiInput 
            type="number"
            value={settings.lockoutDuration.toString()}
            onChange={(value) => handleChange("lockoutDuration", parseInt(value))}
          />
        </div>
        <div className="flex justify-end pt-2">
          <TuiButton variant="primary" size="sm" onClick={() => console.log('Save Security Settings', settings)}>
            Save Changes
          </TuiButton>
        </div>
      </div>
    </TuiPanel>
  );
}

export function FeatureSettings({ initialSettings }: { initialSettings: any }) {
  const [settings, setSettings] = useState(initialSettings);

  const handleChange = (key: string, value: any) => {
    setSettings((prev: any) => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <TuiPanel title="Feature Toggles" color="green">
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center">
          <TuiSwitch 
            checked={settings.registrationEnabled} 
            onChange={(checked) => handleChange("registrationEnabled", checked)}
          />
          <span className="ml-2 text-tui-white">User Registration</span>
        </div>
        <div className="flex items-center">
          <TuiSwitch 
            checked={settings.apiKeyExpirationEnabled} 
            onChange={(checked) => handleChange("apiKeyExpirationEnabled", checked)}
          />
          <span className="ml-2 text-tui-white">API Key Expiration</span>
        </div>
        <div className="flex items-center">
          <TuiSwitch 
            checked={settings.usageTrackingEnabled} 
            onChange={(checked) => handleChange("usageTrackingEnabled", checked)}
          />
          <span className="ml-2 text-tui-white">Usage Tracking</span>
        </div>
        <div className="flex justify-end pt-2">
          <TuiButton variant="primary" size="sm" onClick={() => console.log('Save Feature Settings', settings)}>
            Save Changes
          </TuiButton>
        </div>
      </div>
    </TuiPanel>
  );
}

export function MaintenanceSettings({ initialSettings }: { initialSettings: any }) {
  const [settings, setSettings] = useState(initialSettings);

  const handleChange = (key: string, value: any) => {
    setSettings((prev: any) => ({
      ...prev,
      [key]: value
    }));
  };

  return (
    <TuiPanel title="Maintenance Mode" color="yellow">
      <div className="px-4 py-3 space-y-3">
        <div className="flex items-center">
          <TuiSwitch 
            checked={settings.maintenanceMode} 
            onChange={(checked) => handleChange("maintenanceMode", checked)}
          />
          <span className="ml-2 text-tui-white">Enable Maintenance Mode</span>
        </div>
        <div>
          <label className="block text-tui-gray text-sm mb-1">Maintenance Message</label>
          <TuiInput 
            value={settings.maintenanceMessage}
            onChange={(value) => handleChange("maintenanceMessage", value)}
          />
        </div>
        <div className="flex justify-end pt-2">
          <TuiButton 
            variant={settings.maintenanceMode ? "destructive" : "primary"} 
            size="sm" 
            onClick={() => console.log('Save Maintenance Settings', settings)}
          >
            {settings.maintenanceMode ? 'Apply Maintenance Mode' : 'Save Changes'}
          </TuiButton>
        </div>
      </div>
    </TuiPanel>
  );
} 