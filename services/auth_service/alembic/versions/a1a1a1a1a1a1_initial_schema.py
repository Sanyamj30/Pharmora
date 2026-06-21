"""initial schema

Revision ID: a1a1a1a1a1a1
Revises: None
Create Date: 2026-06-16 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
import bcrypt
import uuid

# revision identifiers, used by Alembic.
revision: str = 'a1a1a1a1a1a1'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create regions table
    op.create_table(
        'regions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('state', sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )

    # 2. Create users table
    op.create_table(
        'users',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('username', sa.String(length=100), nullable=False),
        sa.Column('email', sa.String(length=255), nullable=False),
        sa.Column('password_hash', sa.String(length=255), nullable=False),
        sa.Column('role', sa.String(length=50), nullable=False),
        sa.Column('region_id', sa.UUID(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('failed_login_attempts', sa.Integer(), nullable=False),
        sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['region_id'], ['regions.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.CheckConstraint(
            "role IN ('regional_admin', 'pharmacist', 'inventory_controller', 'finance_manager')",
            name='check_user_role'
        )
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # 3. Create user_outlet_scope table
    op.create_table(
        'user_outlet_scope',
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('outlet_id', sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'outlet_id')
    )

    # 4. Create refresh_tokens table
    op.create_table(
        'refresh_tokens',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('token_hash', sa.String(length=255), nullable=False),
        sa.Column('issued_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('revoked', sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_refresh_tokens_token_hash'), 'refresh_tokens', ['token_hash'], unique=True)

    # Seed default Region (Postgres dialect execution)
    region_id = str(uuid.uuid4())
    op.execute(
        f"INSERT INTO regions (id, name, state) VALUES ('{region_id}', 'South Region', 'Karnataka')"
    )

    # Seed default admin user (password: adminpassword)
    admin_id = str(uuid.uuid4())
    admin_pwd_hash = bcrypt.hashpw(b"adminpassword", bcrypt.gensalt()).decode('utf-8')
    op.execute(
        f"INSERT INTO users (id, username, email, password_hash, role, region_id, is_active, failed_login_attempts, created_at, updated_at) "
        f"VALUES ('{admin_id}', 'admin', 'admin@pharmora.com', '{admin_pwd_hash}', 'regional_admin', '{region_id}', true, 0, NOW(), NOW())"
    )


def downgrade() -> None:
    op.drop_index(op.f('ix_refresh_tokens_token_hash'), table_name='refresh_tokens')
    op.drop_table('refresh_tokens')
    op.drop_table('user_outlet_scope')
    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
    op.drop_table('regions')
