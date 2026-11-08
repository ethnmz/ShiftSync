def supported_quote(quote: str, statement: str) -> bool:
    """Accept only a contiguous source span so the UI can highlight it verbatim."""
    return 3 <= len(quote.split()) <= 30 and quote in statement
