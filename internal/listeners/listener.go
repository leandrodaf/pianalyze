package listeners

import "github.com/leandrodaf/pianalyze/pkg/pubsub"

// Listener defines an interface for processing incoming pubsub messages.
type Listener interface {
	ProcessMessage(msg pubsub.Message) // Processes a received pubsub message.
}
