from sqlalchemy import Column, Integer, String, ForeignKey, Text, Float, JSON
from sqlalchemy.orm import relationship
from app.models.base import Base, TimestampMixin


class Conversation(Base, TimestampMixin):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), default="New Conversation")
    message_count = Column(Integer, default=0)
    summary = Column(Text, nullable=True)           # Compressed summary of older messages
    summary_up_to = Column(Integer, default=0)      # Message count when summary was last generated

    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan")


class Message(Base, TimestampMixin):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=False)
    role = Column(String(20), nullable=False)  # user / assistant / system
    content = Column(Text, nullable=False)
    sources_json = Column(JSON)       # Answer source attribution
    chart_json = Column(JSON)         # ECharts config
    model_used = Column(String(50))   # Which LLM was used
    tokens_in = Column(Integer, default=0)
    tokens_out = Column(Integer, default=0)
    confidence = Column(Float)

    conversation = relationship("Conversation", back_populates="messages")
