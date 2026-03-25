# Plan: Implement ai.ezif.in as a New Provider

This plan details the steps to integrate `ai.ezif.in` as an OpenAI-compatible provider in the `involvex-claude-router` (ccr).

## Objective

Enable users to add `ai.ezif.in` as a provider, select its models, and route traffic through it using its OpenAI-compatible API.

## Key Files & Context

- `open-sse/config/constants.js`: Centralized provider configurations (base URLs, formats).
- `open-sse/config/providerModels.js`: Model definitions and provider-to-alias mapping.
- `src/shared/constants/providers.js`: UI-side provider definitions (icons, colors, website).
- `src/app/api/providers/[id]/models/route.js`: Server-side logic for fetching dynamic model lists from providers.

## Implementation Steps

### 1. Update Provider Configurations

Add `ezif` to the `PROVIDERS` object in `open-sse/config/constants.js`.

- **Base URL:** `https://ai.ezif.in/v1/chat/completions`
- **Format:** `openai`

### 2. Define Models and Mapping

Modify `open-sse/config/providerModels.js`:

- Add a new entry for `ezif` in `PROVIDER_MODELS` with a set of standard models (gpt-4o, gpt-4o-mini, deepseek-chat, deepseek-reasoner).
- Add `"ezif": "ezif"` to the `PROVIDER_ID_TO_ALIAS` mapping.

### 3. Add UI Provider Definition

Modify `src/shared/constants/providers.js`:

- Add the `ezif` provider definition to `APIKEY_PROVIDERS`.
- Include metadata like name ("EZIF AI"), icon ("bolt"), color ("#4F46E5"), and website ("https://ai.ezif.in").

### 4. Enable Model Fetching

Update `src/app/api/providers/[id]/models/route.js`:

- Add `ezif` to `PROVIDER_MODELS_CONFIG` to allow the dashboard to fetch the latest models directly from `https://ai.ezif.in/v1/models`.

## Verification & Testing

1. **Linting & Formatting:** Run `npm run lint` and `npm run format` to ensure code quality.
2. **UI Verification:**
   - Open the dashboard.
   - Go to "Providers" -> "Add Connection".
   - Verify "EZIF AI" appears in the provider list.
3. **Connectivity Test:**
   - Add an EZIF connection with a valid API key.
   - Use the "Test Connection" feature in the UI.
4. **Model Fetching:**
   - Verify the model list can be refreshed from the provider's API.
5. **End-to-End Chat:**
   - Route a request through the EZIF provider using its models and verify the response.
