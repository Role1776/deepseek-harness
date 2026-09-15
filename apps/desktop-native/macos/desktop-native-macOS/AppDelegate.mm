#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
  [[@"didFinishLaunching\n" dataUsingEncoding:NSUTF8StringEncoding]
      writeToFile:@"/Users/fedor/deepseek-harness/apps/desktop-native/.spike/boot.log" atomically:YES];
  self.moduleName = @"desktop-native";
  // You can add your custom initial props in the dictionary below.
  // They will be passed down to the ViewController used by React Native.
  self.initialProps = @{};
  self.dependencyProvider = [RCTAppDependencyProvider new];

  NSApp.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
  return [super applicationDidFinishLaunching:notification];
}

- (void)applicationWillFinishLaunching:(NSNotification *)notification
{
  [super applicationWillFinishLaunching:notification];
}

- (void)applicationDidBecomeActive:(NSNotification *)notification
{
  [super applicationDidBecomeActive:notification];
  self.window.title = @"deepseek native · phase 0";
  self.window.titlebarAppearsTransparent = YES;
  self.window.backgroundColor = [NSColor colorWithWhite:0.05 alpha:1.0];
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@"index"];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

/// This method controls whether the `concurrentRoot`feature of React18 is turned on or off.
///
/// @see: https://reactjs.org/blog/2022/03/29/react-v18.html
/// @note: This requires to be rendering on Fabric (i.e. on the New Architecture).
/// @return: `true` if the `concurrentRoot` feature is enabled. Otherwise, it returns `false`.
- (BOOL)concurrentRootEnabled
{
#ifdef RN_FABRIC_ENABLED
  return true;
#else
  return false;
#endif
}

@end
