type RuntimeMode = "aws" | "localstack";

const mode = (import.meta.env.VITE_API_MODE as RuntimeMode | undefined) ?? "aws";

const awsBaseUrl = import.meta.env.VITE_API_BASE_URL_AWS ?? "http://localhost:8000";
const localstackBaseUrl =
  import.meta.env.VITE_API_BASE_URL_LOCALSTACK ?? "http://localhost:8000";

const baseUrl = mode === "aws" ? awsBaseUrl : localstackBaseUrl;

export const runtimeConfig = {
  mode,
  baseUrl,
};
