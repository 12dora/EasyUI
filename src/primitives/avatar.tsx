/**
 * 用户头像:有 avatarUrl 时渲染图片, 否则展示品牌蓝首字母圆圈。
 * 供顶栏身份菜单与权限引导页等共用。
 */

type AvatarSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "h-9 w-9 text-[12px]",
  md: "h-10 w-10 text-[13px]",
  lg: "h-14 w-14 text-[16px]",
};

interface UserAvatarProps {
  readonly name: string;
  readonly avatarUrl?: string | null;
  readonly size?: AvatarSize;
  readonly className?: string;
  readonly "data-test-id"?: string;
}

export function UserAvatar({ name, avatarUrl, size = "sm", className = "", "data-test-id": testId }: UserAvatarProps) {
  const sizeClass = SIZE_CLASS[size];
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- 头像来自上游 IdP 任意域名, 不走 next/image 域名白名单
      <img src={avatarUrl} alt={name} className={`${sizeClass} shrink-0 rounded-full border border-hairline object-cover ${className}`} data-test-id={testId} />
    );
  }
  return (
    <span
      className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full border border-[rgb(var(--amber))]/20 bg-[rgb(var(--amber))]/[0.08] font-semibold text-[rgb(var(--amber))] ${className}`}
      data-test-id={testId}
    >
      {avatarInitials(name)}
    </span>
  );
}

export function avatarInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  const compact = name.replace(/\s+/g, "");
  return (compact.slice(0, 2) || "ET").toUpperCase();
}
