import pytest

from app.certainty.floor import CertaintyRaiseError, floor_certainty, operator_set_certainty


@pytest.mark.parametrize("quote,expected,term", [
    ("UPS-B maintenance is mostly finished", "unverified", "mostly"),
    ("I think they finished", "unverified", "i think"),
    ("It should be done by now", "unverified", "should be"),
    ("Generator 1 looks good", "reported", "looks good"),
    ("The vendor said it's done", "reported", "vendor said"),
    ("I'm not sure what happened with the cooling inspection", "unknown", "not sure"),
    ("I honestly don't know if they finished", "unknown", "don't know"),
    ("I honestly don’t know if they finished", "unknown", "don't know"),  # curly apostrophe
    ("I never got a report", "unknown", "never got"),
])
def test_hedged_quotes_are_never_confirmed(quote, expected, term):
    certainty, reason = floor_certainty("confirmed", quote)
    assert certainty == expected
    assert term in reason


def test_plain_statement_stays_confirmed():
    assert floor_certainty("confirmed", "No, it's still in maintenance bypass.") == ("confirmed", None)


def test_strictest_term_wins():
    # Both a hedge ("i think") and an uncertainty term ("not sure") → unknown.
    assert floor_certainty("confirmed", "I think, but I'm not sure, it finished")[0] == "unknown"


def test_floor_only_lowers():
    # The LLM already said unknown; a hedge must not raise it to unverified.
    assert floor_certainty("unknown", "it's probably fine") == ("unknown", None)


def test_whole_phrase_only():
    # "might" must not match inside "mighty".
    assert floor_certainty("confirmed", "The mighty chiller is running")[0] == "confirmed"


def test_missing_quote_caps_at_reported():
    assert floor_certainty("confirmed", None) == ("reported", "no_quote")


def test_operator_cannot_raise_without_new_statement():
    with pytest.raises(CertaintyRaiseError):
        operator_set_certainty("unverified", "confirmed", None)


def test_operator_raise_is_floored_by_new_statement():
    assert operator_set_certainty("unverified", "confirmed", "I think the vendor finished")[0] == "unverified"
    assert operator_set_certainty("unverified", "confirmed", "The vendor emailed the completion report") == (
        "confirmed", "operator stated")


def test_operator_may_lower():
    assert operator_set_certainty("confirmed", "unknown", None) == ("unknown", "operator lowered")
