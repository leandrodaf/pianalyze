<p align="center">
  <img src="logo_icon.png" alt="Pianalyze" width="180"/>
</p>

# Pianalyze

## Overview

Pianalyze is a Go-based application designed to capture, process, and analyze MIDI events in real-time, with the goal of evolving into an interactive piano learning tool. The application provides a modular and extensible architecture, allowing it to be adapted for various musical and educational use cases, such as detecting chords, analyzing playing patterns, and guiding learners through exercises.

## Features

- **Cross-Platform MIDI Support:** Native MIDI integration for macOS (using `go-coremidi`) and Windows (using `winmm.dll`).
- **Real-Time MIDI Event Handling:** Captures MIDI events (e.g., note on/off, velocity) and processes them in real-time.
- **Chord Detection and Performance Analysis:** Identifies chords and analyzes playing dynamics to provide feedback on speed and accuracy.
- **Modular and Extensible Core Architecture:** Built on a core event-processing framework that allows easy integration of additional features like interactive lessons and performance metrics.


## Vision

The long-term goal is for Pianalyze to evolve into a comprehensive piano teaching application. The core processing framework will serve as the foundation for features such as:

- **Interactive Lessons:** A step-by-step guide to learning piano, where the application tracks student progress, verifies accuracy, and provides feedback.
- **Gamified Learning:** Incorporate game-like elements, such as scoring and timed challenges, to make learning more engaging.
- **Advanced Metrics:** Analyze playing patterns, measure velocity and timing accuracy, and identify areas for improvement.

## Core Architecture

The application is organized into key packages that form the foundation for MIDI event processing and future expansions.

### Core Packages

- **`internal/entity/`:** Contains the data structures for representing MIDI events and device information.
- **`internal/listeners/`:** Implements the listeners for processing MIDI events, such as chord detection and velocity analysis.
- **`internal/channel/`:** Manages the flow of MIDI events through channels for efficient real-time processing.

### Platform-Specific MIDI Integration

- **`pkg/midi/`:** Provides MIDI client implementations that are tailored to different operating systems:
  - **macOS (`mididarwin`)**: Uses `go-coremidi` for native MIDI integration.
  - **Windows (`midiwindows`)**: Uses `winmm.dll` to interface with the system's MIDI capabilities.
  - **Dummy Implementations**: For unsupported platforms or testing scenarios, dummy implementations simulate the behavior of MIDI clients.

## Getting Started

### Prerequisites

- **Go 1.23 or higher** is required to build and run the application.
- **macOS:** Ensure `go-coremidi` dependencies are installed.
- **Windows:** MIDI support is built-in via `winmm.dll`.

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/leandrodaf/pianalyze.git
   cd pianalyze
   ```

2. **Install dependencies:**
   ```bash
   go mod tidy
   ```

3. **Run the application:**
   ```bash
   go run main.go
   ```

### Configuration

The application can be configured through environment variables:

- `GO_ENV`: Set to `production` for production-level logging or leave unset for development mode.

The `.editorconfig` file is provided to maintain consistent coding styles across different editors:

```editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true

[*.go]
indent_style = tab
indent_size = 8
max_line_length = 120
```

## Usage

1. **Start the Application:** Upon starting, you will be prompted to select a MIDI device from the available list.
2. **Real-Time MIDI Event Capture:** The application will capture MIDI events and process them in real-time.
3. **Chord Detection and Velocity Analysis:** Results will be displayed in the logs or processed further for advanced metrics.

### Key Commands

- **Start MIDI Capture:** Initiates MIDI event capture and publishing through the pub-sub system.
- **Stop MIDI Capture:** Halts MIDI event capture and disconnects the device.

## Development

### Core Folder Structure

- **`internal/entity/`:** Defines core data structures such as `MIDI` events and `DeviceInfo`.
- **`internal/listeners/`:** Contains the logic for processing MIDI events, with listeners for chord detection and velocity analysis.
- **`internal/channel/`:** Manages the event channels that facilitate communication between components.
- **`pkg/logger/`:** Implements the logging interface using the Zap library, supporting flexible configuration.
- **`pkg/pubsub/`:** A simple publish-subscribe system used for event distribution.

### Testing

Run unit tests using:
```bash
go test ./...
```

### Code Style

Adhere to the guidelines in the `.editorconfig` file for consistent formatting.

## Contributing

Contributions are welcome! To contribute:

1. **Fork the repository.**
2. **Create a feature branch:** `git checkout -b feature-name`.
3. **Commit your changes:** Use the Santander commit message format for consistency.
4. **Push your branch:** `git push origin feature-name`.
5. **Open a pull request** and provide details about the changes.

## Future Roadmap

- **Interactive Piano Lessons:** Develop features to guide learners through piano exercises, offering real-time feedback.
- **Advanced MIDI Analysis:** Add functionalities for detecting playing patterns, rhythm analysis, and performance scoring.
- **Mobile and Web Integrations:** Expand the application to support mobile and web platforms for wider accessibility.

## License

This project is licensed under the MIT License.

## Troubleshooting

### Common Issues

- **No MIDI events captured:** Ensure that the selected device is connected and working.
- **Unsupported platforms:** Dummy implementations are available for testing, but some features may be limited.

For other issues, please open a GitHub issue.

