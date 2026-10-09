import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

// 렌더 오류가 창 전체를 빈 화면으로 만들지 않게 한다. 복구는 창 다시 불러오기.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('render error', error, info.componentStack)
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children
    return (
      <div role="alert" style={{ padding: 16, fontSize: 13 }}>
        <p style={{ margin: '0 0 8px' }}>화면을 그리는 중 문제가 생겼어요.</p>
        <code style={{ display: 'block', marginBottom: 12, wordBreak: 'break-all' }}>{this.state.error.message}</code>
        <button type="button" onClick={() => location.reload()}>
          다시 불러오기
        </button>
      </div>
    )
  }
}
