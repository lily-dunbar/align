export const PUBLIC_DEMO_USER_ID = "public-demo-user";

export function isPublicDemoUser(userId: string): boolean {
  return userId === PUBLIC_DEMO_USER_ID;
}
