Pod::Spec.new do |s|
  s.name         = 'DshNative'
  s.version      = '0.0.1'
  s.summary      = 'Phase 0 spike native pieces: vibrancy view, host process bridge.'
  s.license      = 'MIT'
  s.author       = { 'deepseek-harness' => 'noreply@example.com' }
  s.homepage     = 'https://example.com/dsh-native'
  s.platform     = :osx, '14.0'
  s.source       = { :path => '.' }
  s.source_files = 'ios/**/*.{h,m,mm}'
  s.requires_arc = true
  s.dependency 'React-Core'
end
