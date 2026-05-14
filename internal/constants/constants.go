package constants

import "errors"

// Sentinel values used by pipeline stages to signal absence of a detected musical element.
const (
	NonTriad     = "Not a Triad"
	UnknownChord = "Unknown Chord"
	UnknownTriad = "Unknown Triad"
)

// Logger messages for each pipeline stage.
const (
	MsgMIDIClientSetupError      = "Failed to set up MIDI client"
	MsgMIDIClientSetupSuccess    = "MIDI client setup successfully"
	MsgMIDIEventCaptureStarted   = "Capturing MIDI events. Press Ctrl+C to stop."
	MsgDeviceSelectionError      = "Failed to select MIDI device"
	MsgMIDIProcessingError       = "Pipeline processing error"
	MsgNoPreviousEvent           = "No previous event, interval set to 0"
	MsgNoteOnDetected            = "Note On event detected"
	MsgNoteOffDetected           = "Note Off event detected"
	MsgNoteOffViaVelocity0       = "Note Off via NoteOn with Velocity 0"
	MsgChordAndInversionDetected = "Chord and inversion identified"
	MsgTriadIdentified           = "Triad identified"
	MsgNotTriad                  = "Chord is not a triad"
	MsgUnknownChord              = "Chord not identified"
	MsgUnknownTriad              = "Triad not identified"
	MsgPipelineContextMIDI       = "PipelineContext MIDI Event"
	MsgPipelineAdditionalDetails = "PipelineContext Additional Details"
	MsgStatePressedNotes         = "State: Pressed Notes"
	MsgStateLastNoteTime         = "State: Last Note Time"
	MsgIntervalCalculated        = "Interval calculated"
)

// Sentinel errors for device selection.
var (
	ErrNoMIDIDevices   = errors.New("no MIDI devices found")
	ErrInvalidDeviceID = errors.New("invalid device ID selected")
)

// ErrLoggerInitialization is the prefix used when the logger fails to initialize.
const ErrLoggerInitialization = "Error initializing logger"

// BuildModeProduction selects structured JSON logging when set via -ldflags.
const BuildModeProduction = "production"

// MIDIChannelBufferSize is the capacity of the MIDI event channel.
const MIDIChannelBufferSize = 100

// OutOfRangeNote is returned by GetNoteName for MIDI values outside 0–127.
const OutOfRangeNote = "Out of Range"
