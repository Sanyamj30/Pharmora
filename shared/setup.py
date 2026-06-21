from setuptools import setup, find_packages

setup(
    name="shared",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "fastapi",
        "pydantic",
        "pyjwt",
        "loguru",
        "sqlalchemy",
        "confluent-kafka",
    ]
)
