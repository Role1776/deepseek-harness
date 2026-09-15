#import "DshVibrancyViewManager.h"

#import <AppKit/AppKit.h>

/** NSVisualEffectView whose material and blending mode are driven from JS. */
@interface DshVibrancyView : NSVisualEffectView
@property (nonatomic, copy) NSString *materialName;
@property (nonatomic, copy) NSString *blendingName;
@end

@implementation DshVibrancyView

- (instancetype)init
{
  if (self = [super init]) {
    self.material = NSVisualEffectMaterialSidebar;
    self.blendingMode = NSVisualEffectBlendingModeBehindWindow;
    self.state = NSVisualEffectStateActive;
  }
  return self;
}

- (void)setMaterialName:(NSString *)materialName
{
  _materialName = [materialName copy];
  static NSDictionary<NSString *, NSNumber *> *materials;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    materials = @{
      @"sidebar": @(NSVisualEffectMaterialSidebar),
      @"headerView": @(NSVisualEffectMaterialHeaderView),
      @"windowBackground": @(NSVisualEffectMaterialWindowBackground),
      @"hudWindow": @(NSVisualEffectMaterialHUDWindow),
      @"fullScreenUI": @(NSVisualEffectMaterialFullScreenUI),
      @"underWindowBackground": @(NSVisualEffectMaterialUnderWindowBackground),
      @"popover": @(NSVisualEffectMaterialPopover),
      @"menu": @(NSVisualEffectMaterialMenu),
      @"titlebar": @(NSVisualEffectMaterialTitlebar),
    };
  });
  NSNumber *material = materials[materialName];
  if (material != nil) {
    self.material = (NSVisualEffectMaterial)material.integerValue;
  }
}

- (void)setBlendingName:(NSString *)blendingName
{
  _blendingName = [blendingName copy];
  if ([blendingName isEqualToString:@"behindWindow"]) {
    self.blendingMode = NSVisualEffectBlendingModeBehindWindow;
  } else if ([blendingName isEqualToString:@"withinWindow"]) {
    self.blendingMode = NSVisualEffectBlendingModeWithinWindow;
  }
}

@end

@implementation DshVibrancyViewManager

RCT_EXPORT_MODULE(DshVibrancyView)

- (NSView *)view
{
  return [[DshVibrancyView alloc] init];
}

RCT_EXPORT_VIEW_PROPERTY(materialName, NSString)
RCT_EXPORT_VIEW_PROPERTY(blendingName, NSString)

@end
