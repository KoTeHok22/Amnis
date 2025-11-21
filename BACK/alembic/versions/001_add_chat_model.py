"""Add Chat model
Revision ID: 001_add_chat_model
Revises:
Create Date: 2025-11-15 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = '001_add_chat_model'
down_revision = '000_initial_users_table'
branch_labels = None
depends_on = None
def upgrade() -> None:
    # Check if the chats table already exists before creating it
    conn = op.get_bind()
    result = conn.execute(sa.text("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name = 'chats'
        );
    """))
    table_exists = result.fetchone()[0]

    if not table_exists:
        op.create_table(
            'chats',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), nullable=False),
            sa.Column('chat_id', sa.String(), nullable=False),
            sa.Column('title', sa.String(length=255), nullable=False),
            sa.Column('created_at', sa.DateTime(), nullable=True),
            sa.Column('updated_at', sa.DateTime(), nullable=True),
            sa.Column('is_active', sa.Boolean(), nullable=True),
            sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
            sa.PrimaryKeyConstraint('id')
        )
        op.create_index(op.f('ix_chats_id'), 'chats', ['id'], unique=False)
        op.create_index(op.f('ix_chats_chat_id'), 'chats', ['chat_id'], unique=True)
        op.create_index(op.f('ix_chats_user_id'), 'chats', ['user_id'], unique=False)
def downgrade() -> None:
    op.drop_index(op.f('ix_chats_user_id'), table_name='chats')
    op.drop_index(op.f('ix_chats_chat_id'), table_name='chats')
    op.drop_index(op.f('ix_chats_id'), table_name='chats')
    op.drop_table('chats')