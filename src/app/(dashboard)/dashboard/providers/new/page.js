"use client";

import {
  AI_PROVIDERS,
  AUTH_METHODS,
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  FREE_PROVIDERS,
} from "@/shared/constants/providers";
import { useRouter, useSearchParams } from "next/navigation";
import OAuthModal from "@/shared/components/OAuthModal";
import { useState, useEffect, Suspense } from "react";
import Toggle from "@/shared/components/Toggle";
import Select from "@/shared/components/Select";
import Button from "@/shared/components/Button";
import Input from "@/shared/components/Input";
import Card from "@/shared/components/Card";
import Link from "next/link";

// Combine all providers for the dropdown
const ALL_PROVIDERS = {
  ...FREE_PROVIDERS,
  ...OAUTH_PROVIDERS,
  ...APIKEY_PROVIDERS,
};

const providerOptions = Object.values(ALL_PROVIDERS).map(p => ({
  value: p.id,
  label: p.name,
}));

const authMethodOptions = Object.values(AUTH_METHODS).map(m => ({
  value: m.id,
  label: m.name,
}));

function NewProviderForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProvider = searchParams.get("provider") || "";

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [showOAuthModal, setShowOAuthModal] = useState(false);
  const [oauthData, setOAuthData] = useState(null);

  const [formData, setFormData] = useState({
    provider: initialProvider,
    name: ALL_PROVIDERS[initialProvider]?.name || "",
    isActive: true,
    authMethod: OAUTH_PROVIDERS[initialProvider] ? "oauth" : "apikey",
    apiKey: "",
    accountId: "", // For Cloudflare
    // OAuth fields
    accessToken: "",
    refreshToken: "",
    expiresIn: null,
    email: "",
    displayName: "",
    providerSpecificData: {},
  });

  // Handle initial provider from URL
  useEffect(() => {
    if (initialProvider && !formData.provider) {
      handleChange("provider", initialProvider);
    }
  }, [initialProvider]);

  const handleChange = (field, value) => {
    setFormData(prev => {
      const updates = { [field]: value };

      // Reset fields when provider changes
      if (field === "provider") {
        updates.authMethod = OAUTH_PROVIDERS[value] ? "oauth" : "apikey";
        updates.name = ALL_PROVIDERS[value]?.name || "";
        updates.apiKey = "";
        updates.accessToken = "";
        updates.refreshToken = "";
        setOAuthData(null);
      }

      return { ...prev, ...updates };
    });
    // Clear error when field changes
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: null }));
    }
  };

  const handleOAuthSuccess = data => {
    setOAuthData(data);
    setFormData(prev => ({
      ...prev,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      email: data.email,
      displayName: data.displayName,
      providerSpecificData: data.providerSpecificData,
      // Auto-fill name if empty or default
      name:
        prev.name === ALL_PROVIDERS[prev.provider]?.name
          ? data.displayName || data.email || prev.name
          : prev.name,
    }));
    setShowOAuthModal(false);
  };

  const validate = () => {
    const newErrors = {};
    if (!formData.provider) newErrors.provider = "Provider is required";
    if (!formData.name) newErrors.name = "Name is required";

    if (formData.authMethod === "apikey") {
      if (!formData.apiKey && formData.provider !== "cloudflare") {
        newErrors.apiKey = "API Key is required";
      }
    } else if (formData.authMethod === "oauth") {
      if (!formData.accessToken) {
        newErrors.submit = "Please connect with OAuth first";
      }
    }

    if (formData.provider === "cloudflare" && !formData.accountId.trim()) {
      newErrors.accountId = "Account ID is required for Cloudflare Workers AI";
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async e => {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true);
    try {
      const response = await fetch("/api/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        router.push("/dashboard/providers");
      } else {
        const data = await response.json();
        setErrors({ submit: data.error || "Failed to create provider" });
      }
    } catch (error) {
      setErrors({ submit: "An error occurred. Please try again." });
    } finally {
      setLoading(false);
    }
  };

  const selectedProvider = ALL_PROVIDERS[formData.provider];

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-6"
      >
        {/* Provider Selection */}
        <Select
          label="Provider"
          options={providerOptions}
          value={formData.provider}
          onChange={e => handleChange("provider", e.target.value)}
          placeholder="Select a provider"
          error={errors.provider}
          required
        />

        {/* Provider Info */}
        {selectedProvider && (
          <Card.Section className="flex items-center gap-3">
            <div className="size-10 rounded-lg flex items-center justify-center bg-bg border border-border">
              <span
                className="material-symbols-outlined text-xl"
                style={{ color: selectedProvider.color }}
              >
                {selectedProvider.icon}
              </span>
            </div>
            <div>
              <p className="font-medium">{selectedProvider.name}</p>
              <p className="text-sm text-text-muted">Selected provider</p>
            </div>
          </Card.Section>
        )}

        {/* Auth Method */}
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium">
            Authentication Method <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-3">
            {authMethodOptions.map(method => (
              <button
                key={method.value}
                type="button"
                onClick={() => handleChange("authMethod", method.value)}
                className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-lg border transition-all ${
                  formData.authMethod === method.value
                    ? "bg-primary/5 border-primary text-primary"
                    : "bg-surface border-border text-text-muted hover:bg-bg-hover"
                }`}
              >
                <span className="material-symbols-outlined">
                  {method.value === "apikey" ? "key" : "lock"}
                </span>
                <span className="font-medium">{method.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* API Key Input */}
        {formData.authMethod === "apikey" && (
          <Input
            label="API Key"
            type="password"
            placeholder="Enter your API key"
            value={formData.apiKey}
            onChange={e => handleChange("apiKey", e.target.value)}
            error={errors.apiKey}
            hint="Your API key will be encrypted and stored securely."
            required
          />
        )}

        {/* Cloudflare Account ID */}
        {formData.authMethod === "apikey" &&
          formData.provider === "cloudflare" && (
            <Input
              label="Account ID"
              placeholder="Enter your Cloudflare Account ID"
              value={formData.accountId}
              onChange={e => handleChange("accountId", e.target.value)}
              error={errors.accountId}
              hint="Found in the Cloudflare dashboard under Workers & Pages."
              required
            />
          )}

        {/* OAuth Button */}
        {formData.authMethod === "oauth" && (
          <Card.Section>
            <div className="flex flex-col gap-4">
              <p className="text-sm text-text-muted">
                Connect your account using OAuth authentication.
              </p>

              {oauthData ? (
                <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-600 dark:text-green-400">
                  <span className="material-symbols-outlined">
                    check_circle
                  </span>
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      Connected successfully
                    </p>
                    <p className="text-xs opacity-80">
                      {oauthData.email ||
                        oauthData.displayName ||
                        "Authenticated"}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
                    onClick={() => {
                      setOAuthData(null);
                      setFormData(prev => ({
                        ...prev,
                        accessToken: "",
                        refreshToken: "",
                      }));
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  icon="link"
                  onClick={() => setShowOAuthModal(true)}
                >
                  Connect with OAuth
                </Button>
              )}
            </div>
          </Card.Section>
        )}

        {/* Name */}
        <Input
          label="Name"
          placeholder="e.g., Production API, Dev Environment"
          value={formData.name}
          onChange={e => handleChange("name", e.target.value)}
          error={errors.name}
          hint="A friendly name to identify this configuration."
          required
        />

        {/* Active Toggle */}
        <Toggle
          checked={formData.isActive}
          onChange={checked => handleChange("isActive", checked)}
          label="Active"
          description="Enable this provider for use in your applications"
        />

        {/* Error Message */}
        {errors.submit && (
          <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
            {errors.submit}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-border">
          <Link
            href="/dashboard/providers"
            className="flex-1"
          >
            <Button
              type="button"
              variant="ghost"
              fullWidth
            >
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            loading={loading}
            fullWidth
            className="flex-1"
          >
            Create Provider
          </Button>
        </div>
      </form>

      {/* OAuth Modal */}
      {showOAuthModal && (
        <OAuthModal
          isOpen={showOAuthModal}
          provider={formData.provider}
          providerInfo={ALL_PROVIDERS[formData.provider]}
          onSuccess={handleOAuthSuccess}
          onClose={() => setShowOAuthModal(false)}
        />
      )}
    </>
  );
}

export default function NewProviderPage() {
  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/dashboard/providers"
          className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-primary transition-colors mb-4"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to Providers
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">
          Add New Provider
        </h1>
        <p className="text-text-muted mt-2">
          Configure a new AI provider to use with your applications.
        </p>
      </div>

      {/* Form Wrapped in Suspense because of useSearchParams */}
      <Card>
        <Suspense
          fallback={
            <div className="p-8 text-center text-text-muted">
              Loading form...
            </div>
          }
        >
          <NewProviderForm />
        </Suspense>
      </Card>
    </div>
  );
}
