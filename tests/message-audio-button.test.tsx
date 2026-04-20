import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageAudioButton } from '@/components/chat/MessageAudioButton';

const playMock = vi.fn();
const pauseMock = vi.fn();

class MockAudio {
  src: string;
  onended: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onplay: (() => void) | null = null;

  constructor(src: string) {
    this.src = src;
  }

  play = playMock;
  pause = pauseMock;
}

describe('MessageAudioButton', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    playMock.mockReset();
    pauseMock.mockReset();

    global.Audio = MockAudio as unknown as typeof Audio;
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-audio');
    global.URL.revokeObjectURL = vi.fn();
    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob(['audio'])),
      } as Response)
    );
  });

  it('does not show a browser autoplay block error to the user', async () => {
    playMock.mockRejectedValueOnce(
      Object.assign(
        new Error(
          'The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.'
        ),
        { name: 'NotAllowedError' }
      )
    );

    render(<MessageAudioButton text="test reply" shouldAutoPlay />);

    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(
      screen.queryByText(/not allowed by the user agent|denied permission/i)
    ).not.toBeInTheDocument();
  });

  it('still shows real playback failures after a manual click', async () => {
    playMock.mockRejectedValueOnce(new Error('Audio device unavailable'));

    render(<MessageAudioButton text="test reply" />);

    screen.getByRole('button', { name: /listen/i }).click();

    await waitFor(() => {
      expect(screen.getByText('Audio device unavailable')).toBeInTheDocument();
    });
  });
});
