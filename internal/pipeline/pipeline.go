package pipeline

// Stage represents a single processing step that mutates TContext using shared TState.
type Stage[TContext any, TState any] interface {
	Process(ctx *TContext, state *TState) error
}

// Pipeline executes a sequence of stages in order against a shared state.
type Pipeline[TContext any, TState any] struct {
	stages []Stage[TContext, TState]
	state  *TState
}

// NewPipeline creates a Pipeline with the given shared state and no stages.
func NewPipeline[TContext any, TState any](state *TState) *Pipeline[TContext, TState] {
	return &Pipeline[TContext, TState]{state: state}
}

// AddStage appends a stage; stages run in the order they are added.
func (p *Pipeline[TContext, TState]) AddStage(stage Stage[TContext, TState]) {
	p.stages = append(p.stages, stage)
}

// Process runs ctx through every stage in sequence.
// Returns on the first error.
func (p *Pipeline[TContext, TState]) Process(ctx *TContext) error {
	for _, stage := range p.stages {
		if err := stage.Process(ctx, p.state); err != nil {
			return err
		}
	}
	return nil
}
