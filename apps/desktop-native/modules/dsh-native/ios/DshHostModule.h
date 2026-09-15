#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

/**
 * Spawns the Node launcher that owns the desktop host process and relays its
 * request/response pipe bytes to JavaScript as base64 events.
 */
@interface DshHostModule : RCTEventEmitter <RCTBridgeModule>
@end
