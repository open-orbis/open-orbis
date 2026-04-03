from unittest.mock import AsyncMock, MagicMock


def test_send_message_success(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"uid": "some-uid"})
    )

    payload = {
        "sender_name": "Alice",
        "sender_email": "alice@example.com",
        "subject": "Hello",
        "body": "Test message",
    }
    response = client.post("/messages/test-orb", json=payload)
    assert response.status_code == 201
    assert "uid" in response.json()


def test_send_message_not_found(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=None)
    )

    payload = {
        "sender_name": "Alice",
        "sender_email": "alice@example.com",
        "subject": "Hello",
        "body": "Test message",
    }
    response = client.post("/messages/nonexistent", json=payload)
    assert response.status_code == 404


def test_get_my_messages(client, mock_db):
    msg_record = {
        "message": {
            "uid": "msg-1",
            "sender_name": "Alice",
            "sender_email": "alice@example.com",
            "subject": "Hi",
            "body": "Body",
            "read": False,
            "created_at": "2023-01-01T12:00:00",
        },
        "replies": [],
    }

    async def mock_async_iter(*args, **kwargs):
        yield msg_record

    result_mock = MagicMock()
    result_mock.__aiter__ = mock_async_iter

    mock_db.session.return_value.__aenter__.return_value.run.return_value = result_mock

    response = client.get("/messages/me")
    assert response.status_code == 200
    assert len(response.json()) == 1
    assert response.json()[0]["uid"] == "msg-1"


def test_reply_to_message_success(client, mock_db):
    reply_data = {
        "uid": "reply-1",
        "body": "Replying",
        "from_owner": True,
        "created_at": "2023-01-01T12:05:00",
    }
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"reply": reply_data})
    )

    response = client.post("/messages/me/msg-1/reply", json={"body": "Replying"})
    assert response.status_code == 201
    assert response.json()["uid"] == "reply-1"


def test_reply_to_message_not_found(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=None)
    )
    response = client.post(
        "/messages/me/msg-nonexistent/reply", json={"body": "Replying"}
    )
    assert response.status_code == 404


def test_mark_message_read_success(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"uid": "msg-1"})
    )
    response = client.put("/messages/me/msg-1/read")
    assert response.status_code == 204


def test_mark_message_read_not_found(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value=None)
    )
    response = client.put("/messages/me/msg-nonexistent/read")
    assert response.status_code == 404


def test_delete_message_success(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"deleted": 1})
    )
    response = client.delete("/messages/me/msg-1")
    assert response.status_code == 204


def test_delete_message_not_found(client, mock_db):
    mock_db.session.return_value.__aenter__.return_value.run.return_value.single = (
        AsyncMock(return_value={"deleted": 0})
    )
    response = client.delete("/messages/me/msg-nonexistent")
    assert response.status_code == 404
