import json
import os
import threading
from typing import Any, Dict, List, Callable, Optional
from loguru import logger

# Try to import confluent_kafka, fallback to mock if unavailable
try:
    from confluent_kafka import Producer as ConfluentProducer
    from confluent_kafka import Consumer as ConfluentConsumer
    from confluent_kafka import KafkaError
    KAFKA_AVAILABLE = True
except ImportError:
    KAFKA_AVAILABLE = False
    logger.warning("confluent-kafka package not found. Kafka operations will run in MOCK mode.")


class MockProducer:
    """Mock Kafka producer that stores produced events in-memory for testing/local-dev."""
    def __init__(self, configs: dict):
        self.events: List[Dict[str, Any]] = []
        logger.info("Mock Kafka Producer initialized.")

    def produce(self, topic: str, key: str, value: str, callback: Optional[Callable] = None):
        event = {
            "topic": topic,
            "key": key,
            "value": json.loads(value)
        }
        self.events.append(event)
        logger.info(f"[Mock Kafka] Produced to {topic}: Key={key} Value={event['value']}")
        if callback:
            # Simulate success callback
            parent_producer = self
            class MockMessage:
                def error(self): return None
                def topic(self): return topic
                def partition(self): return 0
                def offset(self): return len(parent_producer.events)
            callback(None, MockMessage())

    def flush(self, timeout: float = 1.0):
        return 0

    def poll(self, timeout: float = 0.0):
        return 0


class MockConsumer:
    """Mock Kafka consumer for testing/local-dev."""
    def __init__(self, configs: dict):
        self.topics = []
        logger.info("Mock Kafka Consumer initialized.")

    def subscribe(self, topics: List[str]):
        self.topics.extend(topics)
        logger.info(f"[Mock Kafka] Subscribed to topics: {topics}")

    def poll(self, timeout: float = 1.0):
        # Always return None in mock poll unless populated manually
        return None

    def close(self):
        logger.info("[Mock Kafka] Consumer closed.")


class KafkaProducer:
    """Production-grade Kafka Producer wrapper."""
    def __init__(self):
        self.bootstrap_servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
        self.use_mock = os.getenv("KAFKA_MOCK", "false").lower() == "true" or not KAFKA_AVAILABLE
        
        if self.use_mock:
            self.producer = MockProducer({})
        else:
            configs = {
                "bootstrap.servers": self.bootstrap_servers,
                "client.id": os.getenv("KAFKA_CLIENT_ID", "pharmoraducer"),
                "acks": "all",  # Ensure durability
            }
            try:
                self.producer = ConfluentProducer(configs)
                logger.info(f"Kafka Producer connected to {self.bootstrap_servers}")
            except Exception as e:
                logger.error(f"Failed to connect Kafka Producer to {self.bootstrap_servers}: {e}. Falling back to MOCK mode.")
                self.producer = MockProducer({})
                self.use_mock = True

    def send_event(self, topic: str, key: str, value: Dict[str, Any]):
        """Publish JSON event to a topic."""
        def delivery_report(err, msg):
            if err is not None:
                logger.error(f"Kafka Delivery failed for topic {topic}: {err}")
            else:
                logger.debug(f"Kafka Event delivered to {msg.topic()} [{msg.partition()}] at offset {msg.offset()}")

        serialized_val = json.dumps(value)
        
        # Produce message
        if self.use_mock:
            self.producer.produce(topic, key, serialized_val, callback=delivery_report)
        else:
            self.producer.produce(topic, key=key, value=serialized_val, callback=delivery_report)
            # Poll to handle delivery callbacks
            self.producer.poll(0)

    def flush(self, timeout: float = 1.0):
        self.producer.flush(timeout)


class KafkaConsumer:
    """Production-grade Kafka Consumer wrapper."""
    def __init__(self, group_id: str, topics: List[str]):
        self.bootstrap_servers = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
        self.use_mock = os.getenv("KAFKA_MOCK", "false").lower() == "true" or not KAFKA_AVAILABLE
        self.topics = topics
        self.group_id = group_id
        self._running = False
        self._thread = None

        if self.use_mock:
            self.consumer = MockConsumer({})
            self.consumer.subscribe(topics)
        else:
            configs = {
                "bootstrap.servers": self.bootstrap_servers,
                "group.id": group_id,
                "auto.offset.reset": "earliest",
                "enable.auto.commit": True,
            }
            try:
                self.consumer = ConfluentConsumer(configs)
                self.consumer.subscribe(topics)
                logger.info(f"Kafka Consumer (group={group_id}) subscribed to {topics} via {self.bootstrap_servers}")
            except Exception as e:
                logger.error(f"Failed to connect Kafka Consumer to {self.bootstrap_servers}: {e}. Falling back to MOCK mode.")
                self.consumer = MockConsumer({})
                self.consumer.subscribe(topics)
                self.use_mock = True

    def start(self, handler: Callable[[str, str, Dict[str, Any]], None]):
        """Start consumption loop in a background thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_loop, args=(handler,), daemon=True)
        self._thread.start()
        logger.info(f"Kafka Consumer loop started in background thread for topics: {self.topics}")

    def _run_loop(self, handler: Callable[[str, str, Dict[str, Any]], None]):
        while self._running:
            try:
                msg = self.consumer.poll(1.0)
                if msg is None:
                    continue
                
                # Check for confluent-kafka errors
                if not self.use_mock and msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    else:
                        logger.error(f"Kafka Consumer error: {msg.error()}")
                        continue
                
                # Extract details
                topic = msg.topic()
                key = msg.key().decode("utf-8") if msg.key() else None
                value_str = msg.value().decode("utf-8") if msg.value() else "{}"
                value = json.loads(value_str)
                
                # Process message via custom handler callback
                handler(topic, key, value)
                
            except Exception as e:
                logger.error(f"Error in Kafka consumer consumption loop: {e}")
                time.sleep(2)  # Backoff

    def stop(self):
        """Stop consumption loop."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        if not self.use_mock:
            self.consumer.close()
        logger.info("Kafka Consumer stopped.")
