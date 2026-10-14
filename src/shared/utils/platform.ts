interface UserAgentData {
  readonly platform: string;
}

interface NavigatorWithUAData extends Navigator {
  readonly userAgentData?: UserAgentData;
}

/** True when the platform uses Cmd as the primary shortcut modifier: macOS and iOS. */
export function isMacLike(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as NavigatorWithUAData;
  const uaPlatform = nav.userAgentData?.platform;
  if (typeof uaPlatform === 'string' && uaPlatform.length > 0) {
    return /^mac|^ios|^iphone|^ipad/i.test(uaPlatform);
  }
  const legacy = nav.platform;
  if (typeof legacy === 'string' && legacy.length > 0) {
    return /^mac|^iphone|^ipad/i.test(legacy);
  }
  return false;
}
