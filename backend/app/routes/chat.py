from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from backend.app.services.booking_graph import booking_agent_graph, BookingState

router = APIRouter(prefix="/api/chat", tags=["Customer Chat"])


class ChatRequest(BaseModel):
    message: str
    session_state: Optional[Dict[str, Any]] = None


class ChatResponse(BaseModel):
    reply: str
    session_state: Dict[str, Any]
    action_buttons: List[str]
    summary_card: Optional[Dict[str, Any]] = None
    reference_no: Optional[str] = None
    status: str


@router.post("/message", response_model=ChatResponse)
def handle_chat_message(req: ChatRequest):
    """Processes a customer message through the LangGraph AI booking graph."""
    raw_state = req.session_state or {}

    history = raw_state.get("conversation_history", [])
    history.append({"role": "user", "content": req.message})

    # Prepare initial graph state
    initial_state: BookingState = {
        "customer_name": raw_state.get("customer_name"),
        "customer_phone": raw_state.get("customer_phone"),
        "customer_address": raw_state.get("customer_address"),
        "service_name": raw_state.get("service_name"),
        "preferred_time": raw_state.get("preferred_time"),
        "discount_requested": raw_state.get("discount_requested", False),
        "discount_notes": raw_state.get("discount_notes"),
        "is_confirmed_by_user": False,
        "status": raw_state.get("status", "COLLECTING"),
        "reference_no": raw_state.get("reference_no"),
        "summary_card": raw_state.get("summary_card"),
        "action_buttons": [],
        "reply": "",
        "user_message": req.message,
        "conversation_history": history
    }

    try:
        final_state = booking_agent_graph.invoke(initial_state)

        # Append assistant reply to history
        history.append({"role": "assistant", "content": final_state.get("reply", "")})

        session_state_out = {
            "customer_name": final_state.get("customer_name"),
            "customer_phone": final_state.get("customer_phone"),
            "customer_address": final_state.get("customer_address"),
            "service_name": final_state.get("service_name"),
            "preferred_time": final_state.get("preferred_time"),
            "discount_requested": final_state.get("discount_requested", False),
            "discount_notes": final_state.get("discount_notes"),
            "status": final_state.get("status", "COLLECTING"),
            "reference_no": final_state.get("reference_no"),
            "summary_card": final_state.get("summary_card"),
            "conversation_history": history
        }

        return ChatResponse(
            reply=final_state.get("reply", ""),
            session_state=session_state_out,
            action_buttons=final_state.get("action_buttons", []),
            summary_card=final_state.get("summary_card"),
            reference_no=final_state.get("reference_no"),
            status=final_state.get("status", "COLLECTING")
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI Agent graph error: {str(e)}")
