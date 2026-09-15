#import "DshHostModule.h"

#import <AppKit/AppKit.h>

@implementation DshHostModule {
  NSTask *_task;
  NSPipe *_stdinPipe;
  NSPipe *_stdoutPipe;
  NSPipe *_stderrPipe;
  NSMutableString *_stderrTail;
  BOOL _hasListeners;
}

RCT_EXPORT_MODULE(DshHost)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ @"dshHostBytes", @"dshHostReady", @"dshHostLog", @"dshHostFatal", @"dshHostExit" ];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

- (void)emit:(NSString *)name body:(id)body
{
  if (!_hasListeners) {
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    @try {
      [self sendEventWithName:name body:body];
    } @catch (NSException *exception) {
      fprintf(stderr, "dsh host: emit %s failed: %s\n", name.UTF8String, exception.reason.UTF8String);
    }
  });
}

- (void)handleStderrChunk:(NSData *)data
{
  NSString *text = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
  if (text == nil) {
    return;
  }
  [_stderrTail appendString:text];
  NSRange newline;
  while ((newline = [_stderrTail rangeOfString:@"\n"]).location != NSNotFound) {
    NSString *line = [_stderrTail substringToIndex:newline.location];
    [_stderrTail deleteCharactersInRange:NSMakeRange(0, newline.location + newline.length)];
    if ([line hasPrefix:@"DSH_READY "]) {
      NSString *payload = [line substringFromIndex:[@"DSH_READY " length]];
      NSData *payloadData = [payload dataUsingEncoding:NSUTF8StringEncoding];
      id json = [NSJSONSerialization JSONObjectWithData:payloadData options:0 error:nil];
      [self emit:@"dshHostReady" body:json ?: @{}];
    } else if ([line hasPrefix:@"DSH_FATAL "]) {
      [self emit:@"dshHostFatal" body:@{ @"message": [line substringFromIndex:[@"DSH_FATAL " length]] }];
    } else if (line.length > 0) {
      [self emit:@"dshHostLog" body:@{ @"line": line }];
    }
  }
}

RCT_EXPORT_METHOD(startHost:(NSDictionary *)config
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  if (_task != nil && _task.isRunning) {
    reject(@"already-running", @"dsh host launcher is already running", nil);
    return;
  }
  fprintf(stderr, "dsh host: startHost requested\n");
  NSString *nodePath = config[@"nodePath"];
  NSString *launcherPath = config[@"launcherPath"];
  NSString *hostEntry = config[@"hostEntry"];
  NSString *runtimeDir = config[@"runtimeDir"];
  NSString *projectDir = config[@"projectDir"];
  NSString *pathEnv = config[@"pathEnv"];
  if (nodePath.length == 0 || launcherPath.length == 0 || hostEntry.length == 0
      || runtimeDir.length == 0 || projectDir.length == 0) {
    reject(@"bad-config", @"startHost requires nodePath, launcherPath, hostEntry, runtimeDir, projectDir", nil);
    return;
  }

  _stdinPipe = [NSPipe pipe];
  _stdoutPipe = [NSPipe pipe];
  _stderrPipe = [NSPipe pipe];
  _stderrTail = [NSMutableString string];

  NSTask *task = [[NSTask alloc] init];
  task.launchPath = nodePath;
  task.arguments = @[ launcherPath, hostEntry, runtimeDir, projectDir ];
  NSMutableDictionary *environment = [NSMutableDictionary dictionaryWithDictionary:[[NSProcessInfo processInfo] environment]];
  if (pathEnv.length > 0) {
    environment[@"PATH"] = pathEnv;
  }
  task.environment = environment;
  task.standardInput = _stdinPipe;
  task.standardOutput = _stdoutPipe;
  task.standardError = _stderrPipe;

  __weak DshHostModule *weakSelf = self;
  _stdoutPipe.fileHandleForReading.readabilityHandler = ^(NSFileHandle *handle) {
    NSData *chunk = handle.availableData;
    if (chunk.length == 0) {
      return;
    }
    DshHostModule *strongSelf = weakSelf;
    [strongSelf emit:@"dshHostBytes" body:@{ @"data": [chunk base64EncodedStringWithOptions:0] }];
  };
  _stderrPipe.fileHandleForReading.readabilityHandler = ^(NSFileHandle *handle) {
    NSData *chunk = handle.availableData;
    if (chunk.length > 0) {
      [weakSelf handleStderrChunk:chunk];
    }
  };
  task.terminationHandler = ^(NSTask *terminated) {
    DshHostModule *strongSelf = weakSelf;
    if (strongSelf == nil) {
      return;
    }
    strongSelf->_stdoutPipe.fileHandleForReading.readabilityHandler = nil;
    strongSelf->_stderrPipe.fileHandleForReading.readabilityHandler = nil;
    [strongSelf emit:@"dshHostExit" body:@{ @"status": @(terminated.terminationStatus) }];
  };

  NSError *launchError = nil;
  if (![task launchAndReturnError:&launchError]) {
    reject(@"launch-failed", launchError.localizedDescription ?: @"NSTask launch failed", launchError);
    _task = nil;
    return;
  }
  _task = task;
  fprintf(stderr, "dsh host: launcher pid %d\n", task.processIdentifier);
  resolve(@{ @"pid": @(task.processIdentifier) });
}

RCT_EXPORT_METHOD(writeToHost:(NSString *)base64)
{
  static BOOL loggedFirstWrite = NO;
  if (!loggedFirstWrite) {
    loggedFirstWrite = YES;
    fprintf(stderr, "dsh host: first writeToHost (%lu base64 chars)\n", (unsigned long)base64.length);
  }
  @try {
    if (_task == nil || !_task.isRunning) {
      return;
    }
    NSData *data = [[NSData alloc] initWithBase64EncodedString:base64 options:0];
    if (data == nil) {
      fprintf(stderr, "dsh host: writeToHost received invalid base64\n");
      return;
    }
    [_stdinPipe.fileHandleForWriting writeData:data];
  } @catch (NSException *exception) {
    fprintf(stderr, "dsh host: writeToHost failed: %s\n", exception.reason.UTF8String);
    [self emit:@"dshHostLog" body:@{ @"line": [NSString stringWithFormat:@"pipe write failed: %@", exception.reason ?: @"?"] }];
  }
}

RCT_EXPORT_METHOD(trace:(NSString *)message
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  fprintf(stderr, "dsh-trace: %s\n", message.UTF8String);
  NSString *line = [message stringByAppendingString:@"\n"];
  NSString *logPath = @"/Users/fedor/deepseek-harness/apps/desktop-native/.spike/trace.log";
  NSFileHandle *handle = [NSFileHandle fileHandleForWritingAtPath:logPath];
  if (handle == nil) {
    [line writeToFile:logPath atomically:YES encoding:NSUTF8StringEncoding error:nil];
  } else {
    [handle seekToEndOfFile];
    [handle writeData:[line dataUsingEncoding:NSUTF8StringEncoding]];
    [handle closeFile];
  }
  resolve(@YES);
}

RCT_EXPORT_METHOD(captureWindow:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSWindow *window = NSApp.keyWindow ?: NSApp.mainWindow ?: NSApp.windows.firstObject;
    NSView *view = window.contentView;
    if (view == nil) {
      reject(@"no-window", @"no window to capture", nil);
      return;
    }
    NSRect bounds = view.bounds;
    NSBitmapImageRep *rep = [view bitmapImageRepForCachingDisplayInRect:bounds];
    if (rep == nil) {
      reject(@"capture-failed", @"could not allocate bitmap", nil);
      return;
    }
    [view cacheDisplayInRect:bounds toBitmapImageRep:rep];
    NSData *png = [rep representationUsingType:NSBitmapImageFileTypePNG properties:@{}];
    NSError *error = nil;
    if (![png writeToFile:path options:NSDataWritingAtomic error:&error]) {
      reject(@"write-failed", error.localizedDescription ?: @"could not write screenshot", error);
      return;
    }
    resolve(@YES);
  });
}

RCT_EXPORT_METHOD(stopHost:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  NSTask *task = _task;
  if (task == nil || !task.isRunning) {
    _task = nil;
    resolve(@YES);
    return;
  }
  _task = nil;
  [task terminate];
  @try {
    [_stdinPipe.fileHandleForWriting closeFile];
  } @catch (NSException *exception) {
    (void)exception;
  }
  resolve(@YES);
}

RCT_EXPORT_METHOD(readTextFile:(NSString *)path
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  fprintf(stderr, "dsh host: readTextFile %s\n", path.UTF8String);
  NSString *text = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&error];
  if (text == nil) {
    reject(@"read-failed", error.localizedDescription ?: @"read failed", error);
    return;
  }
  resolve(text);
}

RCT_EXPORT_METHOD(writeTextFile:(NSString *)path
                  contents:(NSString *)contents
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSError *error = nil;
  fprintf(stderr, "dsh host: writeTextFile %s\n", path.UTF8String);
  NSString *directory = [path stringByDeletingLastPathComponent];
  if (![[NSFileManager defaultManager] createDirectoryAtPath:directory
                               withIntermediateDirectories:YES
                                                attributes:nil
                                                     error:&error]) {
    reject(@"write-failed", error.localizedDescription ?: @"could not create parent directory", error);
    return;
  }
  if (![contents writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:&error]) {
    reject(@"write-failed", error.localizedDescription ?: @"write failed", error);
    return;
  }
  resolve(@YES);
}

@end
