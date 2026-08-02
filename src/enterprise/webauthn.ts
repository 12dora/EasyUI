/**
 * WebAuthn 前端助手(无第三方依赖, 仅浏览器原生 API)。
 *
 * 后端契约: options JSON 中的二进制字段(challenge / user.id /
 * excludeCredentials[].id / allowCredentials[].id)均为 base64url 字符串;
 * 前端提交的 credential 亦以 base64url 序列化(rawId 与 response.* 二进制字段)。
 */

/** base64url 字符串 → ArrayBuffer。 */
export function base64UrlToBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/** ArrayBuffer → base64url 字符串(无 padding)。 */
export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** 浏览器是否支持 WebAuthn(window.PublicKeyCredential 存在)。 */
export function isWebAuthnAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    Boolean(navigator.credentials)
  );
}

/** 后端 options JSON 中的凭据描述符(id 为 base64url 字符串)。 */
interface JsonCredentialDescriptor {
  readonly id: string;
  readonly type?: string;
  readonly transports?: string[];
}

function parseCredentialDescriptor(descriptor: JsonCredentialDescriptor): PublicKeyCredentialDescriptor {
  return {
    id: base64UrlToBuffer(descriptor.id),
    type: (descriptor.type ?? "public-key") as PublicKeyCredentialType,
    transports: descriptor.transports as AuthenticatorTransport[] | undefined,
  };
}

/** 注册 options JSON(begin 响应)→ navigator.credentials.create 参数。 */
export function parseCreationOptions(options: unknown): PublicKeyCredentialCreationOptions {
  const raw = options as Omit<PublicKeyCredentialCreationOptions, "challenge" | "user" | "excludeCredentials"> & {
    challenge: string;
    user: { id: string; name: string; displayName: string };
    excludeCredentials?: JsonCredentialDescriptor[];
  };
  return {
    ...raw,
    challenge: base64UrlToBuffer(raw.challenge),
    user: { ...raw.user, id: base64UrlToBuffer(raw.user.id) },
    excludeCredentials: raw.excludeCredentials?.map(parseCredentialDescriptor),
  };
}

/** 断言 options JSON(begin 响应)→ navigator.credentials.get 参数。 */
export function parseRequestOptions(options: unknown): PublicKeyCredentialRequestOptions {
  const raw = options as Omit<PublicKeyCredentialRequestOptions, "challenge" | "allowCredentials"> & {
    challenge: string;
    allowCredentials?: JsonCredentialDescriptor[];
  };
  return {
    ...raw,
    challenge: base64UrlToBuffer(raw.challenge),
    allowCredentials: raw.allowCredentials?.map(parseCredentialDescriptor),
  };
}

/** 契约 JSON:序列化后的 PublicKeyCredential(注册 attestation / 登录 assertion 二选一)。 */
export interface SerializedPublicKeyCredential {
  readonly id: string;
  readonly rawId: string;
  readonly type: string;
  readonly response: Record<string, unknown>;
  readonly clientExtensionResults: AuthenticationExtensionsClientOutputs;
}

/** navigator.credentials.create/get 返回的 PublicKeyCredential → 契约 JSON。 */
export function serializeCredential(credential: PublicKeyCredential): SerializedPublicKeyCredential {
  return {
    id: credential.id,
    rawId: bufferToBase64Url(credential.rawId),
    type: credential.type,
    response: serializeResponse(credential.response),
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

function serializeResponse(response: AuthenticatorResponse): Record<string, unknown> {
  if (isAttestationResponse(response)) {
    return {
      clientDataJSON: bufferToBase64Url(response.clientDataJSON),
      attestationObject: bufferToBase64Url(response.attestationObject),
      transports: typeof response.getTransports === "function" ? response.getTransports() : [],
    };
  }
  const assertion = response as AuthenticatorAssertionResponse;
  return {
    clientDataJSON: bufferToBase64Url(assertion.clientDataJSON),
    authenticatorData: bufferToBase64Url(assertion.authenticatorData),
    signature: bufferToBase64Url(assertion.signature),
    userHandle: assertion.userHandle ? bufferToBase64Url(assertion.userHandle) : null,
  };
}

function isAttestationResponse(response: AuthenticatorResponse): response is AuthenticatorAttestationResponse {
  return "attestationObject" in response;
}

/** 用户取消 / 超时(NotAllowedError、AbortError)→ 中性提示而非报错。 */
export function isWebAuthnCancelled(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError");
}
