import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:torch_light/torch_light.dart';
import 'package:record/record.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:http/http.dart' as http;
import 'package:path_provider/path_provider.dart';
import 'package:intl/intl.dart';

void main() {
  runApp(const LanternaApp());
}

class LanternaApp extends StatelessWidget {
  const LanternaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Lanterna Educacional',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: Colors.black,
        colorScheme: const ColorScheme.dark(
          primary: Color(0xFFFFD600),
          secondary: Color(0xFFFFD600),
          surface: Color(0xFF1A1A1A),
        ),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage>
    with SingleTickerProviderStateMixin {
  bool _isOn = false;
  bool _isRecording = false;
  int _recordingSeconds = 0;
  Timer? _timer;
  String? _recordingPath;
  DateTime? _recordingStartTime;

  late AnimationController _blinkController;
  late Animation<double> _blinkAnimation;

  final AudioRecorder _audioRecorder = AudioRecorder();

  static const String _backendUrl = 'http://localhost:3001/api/recordings';

  @override
  void initState() {
    super.initState();

    _blinkController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 800),
    )..repeat(reverse: true);

    _blinkAnimation = Tween<double>(begin: 0.2, end: 1.0).animate(
      CurvedAnimation(parent: _blinkController, curve: Curves.easeInOut),
    );

    _requestPermissions();
  }

  Future<void> _requestPermissions() async {
    await [
      Permission.microphone,
      Permission.camera,
    ].request();
  }

  String _formatDuration(int seconds) {
    final minutes = seconds ~/ 60;
    final secs = seconds % 60;
    return '${minutes.toString().padLeft(2, '0')}:${secs.toString().padLeft(2, '0')}';
  }

  Future<void> _toggle() async {
    if (!_isOn) {
      await _turnOn();
    } else {
      await _turnOff();
    }
  }

  Future<void> _turnOn() async {
    // Check permissions first
    final micStatus = await Permission.microphone.status;
    final camStatus = await Permission.camera.status;

    if (!micStatus.isGranted) {
      await Permission.microphone.request();
    }
    if (!camStatus.isGranted) {
      await Permission.camera.request();
    }

    // Turn on flashlight
    try {
      await TorchLight.enableTorch();
    } catch (e) {
      debugPrint('Flashlight error: $e');
    }

    // Start audio recording
    try {
      final dir = await getTemporaryDirectory();
      final timestamp = DateFormat('yyyyMMdd_HHmmss').format(DateTime.now());
      _recordingPath = '${dir.path}/recording_$timestamp.m4a';
      _recordingStartTime = DateTime.now();

      await _audioRecorder.start(
        const RecordConfig(
          encoder: AudioEncoder.aacLc,
          sampleRate: 44100,
          bitRate: 128000,
        ),
        path: _recordingPath!,
      );
    } catch (e) {
      debugPrint('Recording error: $e');
    }

    // Start timer
    _recordingSeconds = 0;
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      setState(() {
        _recordingSeconds++;
      });
    });

    setState(() {
      _isOn = true;
      _isRecording = true;
    });
  }

  Future<void> _turnOff() async {
    // Stop timer
    _timer?.cancel();
    _timer = null;

    // Stop recording
    String? savedPath;
    try {
      savedPath = await _audioRecorder.stop();
    } catch (e) {
      debugPrint('Stop recording error: $e');
    }

    // Turn off flashlight
    try {
      await TorchLight.disableTorch();
    } catch (e) {
      debugPrint('Flashlight error: $e');
    }

    setState(() {
      _isOn = false;
      _isRecording = false;
    });

    // Upload recording
    final pathToUpload = savedPath ?? _recordingPath;
    if (pathToUpload != null) {
      await _uploadRecording(pathToUpload);
    }
  }

  Future<void> _uploadRecording(String filePath) async {
    try {
      final file = File(filePath);
      if (!await file.exists()) {
        debugPrint('Recording file not found: $filePath');
        return;
      }

      final filename = filePath.split('/').last;
      final recordedAt = _recordingStartTime?.toIso8601String() ??
          DateTime.now().toIso8601String();

      final request = http.MultipartRequest('POST', Uri.parse(_backendUrl));
      request.fields['duration'] = _recordingSeconds.toString();
      request.fields['filename'] = filename;
      request.fields['recorded_at'] = recordedAt;
      request.files.add(
        await http.MultipartFile.fromPath(
          'audio',
          filePath,
          filename: filename,
        ),
      );

      final response = await request.send();
      if (response.statusCode == 201) {
        debugPrint('Recording uploaded successfully');
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Gravação enviada com sucesso!'),
              backgroundColor: Colors.green,
              duration: Duration(seconds: 2),
            ),
          );
        }
      } else {
        debugPrint('Upload failed: ${response.statusCode}');
      }

      // Clean up temp file
      await file.delete();
    } catch (e) {
      debugPrint('Upload error: $e');
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    _blinkController.dispose();
    _audioRecorder.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // Header
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              color: const Color(0xFF1A1A1A),
              child: const Text(
                'App Educacional - Demonstração de Recursos do Dispositivo',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Color(0xFFFFD600),
                  fontSize: 14,
                  fontWeight: FontWeight.w600,
                  letterSpacing: 0.3,
                ),
              ),
            ),

            // Main content
            Expanded(
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  // Recording indicator
                  AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    height: _isRecording ? 80 : 0,
                    child: _isRecording
                        ? Column(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              // Blinking dot + text
                              FadeTransition(
                                opacity: _blinkAnimation,
                                child: Row(
                                  mainAxisAlignment: MainAxisAlignment.center,
                                  children: [
                                    const Icon(
                                      Icons.mic,
                                      color: Colors.red,
                                      size: 20,
                                    ),
                                    const SizedBox(width: 8),
                                    const Text(
                                      '● GRAVANDO ÁUDIO',
                                      style: TextStyle(
                                        color: Colors.red,
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                        letterSpacing: 1.2,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 8),
                              // Timer
                              Text(
                                _formatDuration(_recordingSeconds),
                                style: const TextStyle(
                                  color: Colors.red,
                                  fontSize: 22,
                                  fontWeight: FontWeight.w300,
                                  fontFeatures: [
                                    FontFeature.tabularFigures()
                                  ],
                                ),
                              ),
                            ],
                          )
                        : const SizedBox.shrink(),
                  ),

                  const SizedBox(height: 40),

                  // Flashlight button
                  GestureDetector(
                    onTap: _toggle,
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 300),
                      width: 200,
                      height: 200,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: _isOn
                            ? const Color(0xFFFFD600)
                            : const Color(0xFF2A2A2A),
                        boxShadow: _isOn
                            ? [
                                BoxShadow(
                                  color: const Color(0xFFFFD600)
                                      .withOpacity(0.6),
                                  blurRadius: 60,
                                  spreadRadius: 20,
                                ),
                                BoxShadow(
                                  color: const Color(0xFFFFD600)
                                      .withOpacity(0.3),
                                  blurRadius: 100,
                                  spreadRadius: 40,
                                ),
                              ]
                            : [
                                BoxShadow(
                                  color: Colors.white.withOpacity(0.05),
                                  blurRadius: 20,
                                  spreadRadius: 2,
                                ),
                              ],
                      ),
                      child: Icon(
                        _isOn ? Icons.flashlight_on : Icons.flashlight_off,
                        size: 80,
                        color: _isOn ? Colors.black : Colors.grey[600],
                      ),
                    ),
                  ),

                  const SizedBox(height: 32),

                  // Status text
                  Text(
                    _isOn ? 'Toque para desligar' : 'Toque para ligar',
                    style: TextStyle(
                      color: _isOn
                          ? const Color(0xFFFFD600)
                          : Colors.grey[500],
                      fontSize: 16,
                      letterSpacing: 0.5,
                    ),
                  ),

                  const SizedBox(height: 16),

                  // What's happening indicator
                  if (_isOn)
                    Container(
                      margin: const EdgeInsets.symmetric(horizontal: 32),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: const Color(0xFF1A1A1A),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                          color: const Color(0xFFFFD600).withOpacity(0.3),
                        ),
                      ),
                      child: const Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            Icons.info_outline,
                            color: Color(0xFFFFD600),
                            size: 16,
                          ),
                          SizedBox(width: 8),
                          Flexible(
                            child: Text(
                              'Lanterna ligada + Áudio sendo gravado',
                              style: TextStyle(
                                color: Color(0xFFFFD600),
                                fontSize: 13,
                              ),
                              textAlign: TextAlign.center,
                            ),
                          ),
                        ],
                      ),
                    ),
                ],
              ),
            ),

            // Footer
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(16),
              color: const Color(0xFF0D0D0D),
              child: const Text(
                'Este aplicativo é para fins educacionais. A gravação de áudio é feita com seu conhecimento e consentimento.',
                textAlign: TextAlign.center,
                style: TextStyle(
                  color: Colors.grey,
                  fontSize: 11,
                  height: 1.4,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
