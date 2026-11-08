class STTError(Exception):
    """Speech-to-text failed. The message is safe to show to an operator.

    Callers keep the original audio and offer a text box instead
    (docs/ARCHITECTURE.md, Fallbacks). Nothing here ever returns guessed text.
    """
