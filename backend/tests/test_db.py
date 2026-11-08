from datetime import datetime, timezone

from sqlmodel import Session, select

from app import clock, db
from app.models import Fact, Handoff, Item, Person


def test_create_tables_load_roster_and_ids():
    db.init_db("sqlite://", drop=True)
    with Session(db.get_engine()) as s:
        db.load_static(s)
        assert s.get(Person, "maya").role == "lead"
        assert s.exec(select(Person)).all()

        hid = db.next_id(s, Handoff)
        assert hid == "H-0001"
        s.add(Handoff(id=hid, outgoing_id="maya", incoming_id="jordan", created_at=clock.now()))
        assert db.next_id(s, Handoff) == "H-0002"  # counts pending adds
        s.commit()

        item = Item(id=db.next_id(s, Item), handoff_id=hid, kind="vendor_work", title="UPS-B",
                    asset_ids=["UPS-B"])
        s.add(item)
        s.add(Fact(id=db.next_id(s, Fact), item_id=item.id, slot="work_status", value="x", certainty="unknown"))
        s.commit()
        assert s.get(Item, "I-0001").asset_ids == ["UPS-B"]


def test_clock_freeze_and_advance():
    clock.set_now("2026-11-08T12:35:00Z")
    assert clock.now() == datetime(2026, 11, 8, 12, 35, tzinfo=timezone.utc)
    clock.advance(30)
    assert clock.now().second == 30
